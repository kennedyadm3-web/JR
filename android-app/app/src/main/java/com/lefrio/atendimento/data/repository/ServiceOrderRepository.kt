package com.lefrio.atendimento.data.repository

import android.content.Context
import android.util.Log
import com.google.firebase.firestore.FirebaseFirestore
import com.google.firebase.firestore.Source
import com.lefrio.atendimento.data.FirebaseConfig
import com.lefrio.atendimento.data.local.AppDatabase
import com.lefrio.atendimento.data.local.entity.EquipmentChecklistEntity
import com.lefrio.atendimento.data.local.entity.REMOVAL_JUSTIFICATION_MARKER
import com.lefrio.atendimento.data.local.entity.RouteExpenseEntity
import com.lefrio.atendimento.data.local.entity.ServiceOrderEntity
import com.lefrio.atendimento.data.local.entity.SyncQueueEntity
import com.lefrio.atendimento.data.local.entity.TechNotificationEntity
import com.lefrio.atendimento.data.local.entity.isRemovalRequested
import com.lefrio.atendimento.data.sync.SyncWorker
import com.lefrio.atendimento.util.NetworkMonitor
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.async
import kotlinx.coroutines.awaitAll
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.coroutines.tasks.await
import kotlinx.coroutines.withContext
import kotlinx.coroutines.withTimeout
import kotlinx.coroutines.withTimeoutOrNull
import org.json.JSONArray
import org.json.JSONObject
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import java.util.TimeZone
import java.util.UUID

/**
 * Repositório Central de Ordens de Serviço e Atendimentos de Roteiro (Preventivas & Corretivas).
 * Modelo Híbrido Inteligente (Offline-First): grava tudo localmente no Room e sincroniza por marcos operacionais.
 */
class ServiceOrderRepository(private val context: Context) {

    companion object {
        // Cache em memória de máquinas por endereço alimentado na sincronização do roteiro
        private val cachedEquipmentsByAddress = java.util.concurrent.ConcurrentHashMap<String, MutableList<EquipmentOption>>()
        private val itinerarySyncMutex = Mutex()
        @Volatile
        private var lastItinerarySyncAt: Long = 0L
        @Volatile
        private var lastItinerarySyncKey: String = ""
        private const val ITINERARY_COOLDOWN_MS = 3L * 60L * 1000L // 3 minutos entre pulls automáticos
    }

    private val db = AppDatabase.getInstance(context)
    private val orderDao = db.serviceOrderDao()
    private val checklistDao = db.equipmentChecklistDao()
    private val syncDao = db.syncQueueDao()
    private val extrasPrefs = context.getSharedPreferences("lefrio_order_extras_prefs", Context.MODE_PRIVATE)
    private val TAG = "ServiceOrderRepo"

    private fun matchesTechResilient(techField: String?, targetTechName: String, targetTechId: String): Boolean {
        if (techField.isNullOrBlank()) return false
        val tf = techField.trim().uppercase()
        val tn = targetTechName.trim().uppercase()
        val ti = targetTechId.trim().uppercase()

        if (tf == tn || tf == ti) return true
        if (tn.isNotBlank() && (tf.contains(tn) || tn.contains(tf))) return true
        if (ti.isNotBlank() && (tf.contains(ti) || ti.contains(tf))) return true

        val normTf = java.text.Normalizer.normalize(tf, java.text.Normalizer.Form.NFD).replace(Regex("\\p{InCombiningDiacriticalMarks}+"), "")
        val normTn = java.text.Normalizer.normalize(tn, java.text.Normalizer.Form.NFD).replace(Regex("\\p{InCombiningDiacriticalMarks}+"), "")

        if (normTf == normTn || normTf.contains(normTn) || normTn.contains(normTf)) return true

        val tokensF = normTf.split("\\s+".toRegex()).filter { it.length >= 3 }
        val tokensN = normTn.split("\\s+".toRegex()).filter { it.length >= 3 }
        if (tokensF.isNotEmpty() && tokensN.isNotEmpty()) {
            if (tokensF.any { it in tokensN }) return true
        }
        return false
    }

    private fun isIsoDate(value: String): Boolean {
        return value.length == 10 && value[4] == '-' && value[7] == '-'
    }

    private fun subtractDays(isoDate: String, days: Int): String {
        return try {
            val sdf = SimpleDateFormat("yyyy-MM-dd", Locale.US)
            val parsed = sdf.parse(isoDate.take(10)) ?: Date()
            val cal = java.util.Calendar.getInstance().apply {
                time = parsed
                add(java.util.Calendar.DAY_OF_YEAR, -days)
            }
            sdf.format(cal.time)
        } catch (_: Exception) {
            isoDate.take(10)
        }
    }

    fun getAllOrders(): Flow<List<ServiceOrderEntity>> = orderDao.getAllOrdersFlow()

    fun getAllOrdersProgress(): Flow<List<com.lefrio.atendimento.data.local.dao.OrderChecklistProgress>> =
        checklistDao.getAllOrdersProgressFlow()

    fun getOrderById(orderId: String): Flow<ServiceOrderEntity?> = orderDao.getOrderByIdFlow(orderId)

    fun getChecklistForOrder(orderId: String): Flow<List<EquipmentChecklistEntity>> =
        checklistDao.getChecklistForOrderFlow(orderId)

    /**
     * Sincroniza o Roteiro do Dia do Técnico (Pull Controlado com Mutex, Cooldown de 3 min e Recorte Temporal).
     * 1. Consulta apenas a data atual no Firestore; se não houver preventivas hoje, consulta somente o(s) mês(es) da janela de 7 dias.
     * 2. Nunca baixa histórico antigo com fotos Base64 de meses anteriores.
     * 3. Reaproveita cache local de equipamentos já carregados no Room (salvo em forceRefresh manual).
     */
    suspend fun syncDailyItinerary(
        technicianName: String,
        technicianId: String,
        targetDate: String = SimpleDateFormat("yyyy-MM-dd", Locale.getDefault()).format(Date()),
        forceRefresh: Boolean = false
    ): Int = withContext(Dispatchers.IO) {
        // 0. Remove limpa e definitivamente qualquer registro de teste/seed antigo ou inválido do aparelho
        orderDao.deleteInvalidAndFakeOrders()
        orderDao.deleteFakeSeedOrders()
        checklistDao.deleteFakeSeedChecklists()

        val normTechName = technicianName.trim().uppercase()
        val normTechId = technicianId.trim().uppercase()
        val syncKey = "${normTechName}|${normTechId}|${targetDate}"

        // GARANTIA OFFLINE-FIRST: Se o dispositivo não tem internet validada,
        // NUNCA consulta cache vazio nem apaga o banco local Room — retorna imediatamente os dados salvos!
        if (!NetworkMonitor.hasValidatedInternet(context)) {
            Log.d(TAG, "Modo offline ativo em syncDailyItinerary. Mantendo 100% do roteiro local intacto.")
            return@withContext orderDao.getAllOrders().size
        }

        // Cooldown rápido antes de disputar Mutex (evita múltiplos downloads em sequência no 4G)
        if (!forceRefresh && syncKey == lastItinerarySyncKey && (System.currentTimeMillis() - lastItinerarySyncAt) < ITINERARY_COOLDOWN_MS) {
            Log.d(TAG, "Pull de roteiro ignorado por cooldown ativo (3 min). Usando cache local Room.")
            return@withContext orderDao.getAllOrders().size
        }

        itinerarySyncMutex.withLock {
            if (!forceRefresh && syncKey == lastItinerarySyncKey && (System.currentTimeMillis() - lastItinerarySyncAt) < ITINERARY_COOLDOWN_MS) {
                return@withLock orderDao.getAllOrders().size
            }

            if (!NetworkMonitor.hasValidatedInternet(context)) {
                return@withLock orderDao.getAllOrders().size
            }

            val ordersToSave = mutableListOf<ServiceOrderEntity>()
            val checklistToSave = mutableListOf<EquipmentChecklistEntity>()
            val currentMonth = if (targetDate.length >= 7) targetDate.substring(0, 7) else "2026-11"

            var fetchSuccess = false
            var serverQuerySucceeded = false

            // 1. TENTATIVA DIRETA E ENXUTA NO FIRESTORE (Recorte temporal estrito — NUNCA baixa meses históricos!)
            try {
                withTimeout(10_000L) { FirebaseConfig.ensureAuthenticated() }
                val firestore = FirebaseConfig.getFirestore()

                val minPastDate = subtractDays(targetDate, 7)
                val prevMonth = if (minPastDate.length >= 7) minPastDate.substring(0, 7) else currentMonth

                val isEligibleTechDoc: (com.google.firebase.firestore.DocumentSnapshot) -> Boolean = { doc ->
                    val pDate = (doc.getString("plannedDate") ?: "").trim().take(10)
                    val t1 = (doc.getString("technician1") ?: "").trim().uppercase()
                    val t2 = (doc.getString("technician2") ?: "").trim().uppercase()

                    val isMyTech = matchesTechResilient(t1, normTechName, normTechId) ||
                                   matchesTechResilient(t2, normTechName, normTechId)

                    isMyTech && isIsoDate(pDate) && pDate <= targetDate && pDate >= minPastDate
                }

                // A) Primeiro busca SOMENTE a data atual (targetDate) — consulta minúscula e sem fotos históricas
                val candidateDocsMap = LinkedHashMap<String, com.google.firebase.firestore.DocumentSnapshot>()
                val querySuccessCount = java.util.concurrent.atomic.AtomicInteger(0)
                try {
                    val todayDocs = withTimeout(12_000L) {
                        firestore.collection("maintenanceRecords")
                            .whereEqualTo("plannedDate", targetDate)
                            .get(Source.SERVER).await().documents
                    }
                    querySuccessCount.incrementAndGet()
                    for (d in todayDocs) {
                        candidateDocsMap[d.id] = d
                    }
                } catch (e: Exception) {
                    Log.w(TAG, "Falha ao buscar preventivas de hoje no servidor: ${e.message}")
                }

                // Somente se NÃO houver preventivas agendadas para hoje, busca a janela dos últimos 7 dias via mês vigente/anterior
                if (candidateDocsMap.values.none(isEligibleTechDoc)) {
                    try {
                        val monthsToCheck = listOf(currentMonth, prevMonth).distinct()
                        for (m in monthsToCheck) {
                            val monthSnap = withTimeout(12_000L) {
                                firestore.collection("maintenanceRecords")
                                    .whereEqualTo("month", m)
                                    .get(Source.SERVER).await()
                            }
                            querySuccessCount.incrementAndGet()
                            for (d in monthSnap.documents) {
                                candidateDocsMap[d.id] = d
                            }
                        }
                    } catch (e: Exception) {
                        Log.w(TAG, "Consulta da janela de 7 dias em maintenanceRecords falhou: ${e.message}")
                    }
                }

                if (querySuccessCount.get() > 0) {
                    serverQuerySucceeded = true
                    fetchSuccess = true
                }

            // Filtra estritamente documentos do técnico com data válida entre (hoje - 7 dias) e hoje (NUNCA datas futuras)
            val techEligibleDocs = candidateDocsMap.values.filter(isEligibleTechDoc)

            // Regra de exibição:
            // 1. Se houver manutenção preventiva agendada para a data atual (targetDate), exibe SOMENTE a data atual.
            // 2. Caso contrário, exibe SOMENTE a última data agendada para este técnico nos últimos 7 dias.
            // 3. Nunca exibe endereços com data futura (ex: dia 23/11 quando ainda é dia 22/11).
            val eligibleDatesDesc = techEligibleDocs
                .map { (it.getString("plannedDate") ?: "").trim().take(10) }
                .distinct()
                .sortedDescending()

            val activePreventiveDate: String? = when {
                eligibleDatesDesc.contains(targetDate) -> targetDate
                else -> eligibleDatesDesc.firstOrNull { it < targetDate && it >= minPastDate }
            }

            val matchedDocs = if (activePreventiveDate != null) {
                techEligibleDocs.filter { doc ->
                    val pDate = (doc.getString("plannedDate") ?: "").trim().take(10)
                    pDate == activePreventiveDate
                }
            } else {
                emptyList()
            }
            val matchedAddressIds = matchedDocs.mapNotNull { it.getString("addressId")?.trim()?.takeIf { id -> id.isNotBlank() } }.toSet()

            Log.d(TAG, "Preventivas da rota ativa para $normTechName (alvo=$targetDate, efetiva=${activePreventiveDate ?: "nenhuma"}, janela=$minPastDate..$targetDate): ${matchedDocs.size}")

            // Busca em PARALELO apenas os endereços que não possuem dados embutidos suficientes
            val addressMap = java.util.concurrent.ConcurrentHashMap<String, com.google.firebase.firestore.DocumentSnapshot>()
            val clientIdsToFetch = java.util.concurrent.ConcurrentHashMap.newKeySet<String>()

            val addressesNeedingFetch = matchedDocs.mapNotNull { doc ->
                val aid = doc.getString("addressId")?.trim() ?: ""
                val topStreet = doc.getString("addressStreet")?.trim() ?: ""
                val topClientName = doc.getString("clientName")?.trim() ?: ""
                val topClientId = doc.getString("clientId")?.trim() ?: ""
                if (topClientId.isNotBlank() && topClientName.isBlank()) {
                    clientIdsToFetch.add(topClientId)
                }
                if (aid.isNotBlank() && (topStreet.isBlank() || topClientName.isBlank())) aid else null
            }.toSet()

            coroutineScope {
                addressesNeedingFetch.map { aid ->
                    async {
                        try {
                            val addrDoc = firestore.collection("addresses").document(aid).get().await()
                            if (addrDoc.exists()) {
                                addressMap[aid] = addrDoc
                                addrDoc.getString("clientId")?.trim()?.takeIf { it.isNotBlank() }?.let {
                                    clientIdsToFetch.add(it)
                                }
                            }
                        } catch (_: Exception) {}
                    }
                }.awaitAll()
            }

            // Busca dados complementares de clientes em PARALELO
            val clientMap = java.util.concurrent.ConcurrentHashMap<String, String>()
            coroutineScope {
                clientIdsToFetch.map { cid ->
                    async {
                        try {
                            val clientDoc = firestore.collection("clients").document(cid).get().await()
                            if (clientDoc.exists()) {
                                val cName = clientDoc.getString("name") ?: clientDoc.getString("fullName")
                                if (!cName.isNullOrBlank()) clientMap[cid] = cName.trim()
                            }
                        } catch (_: Exception) {}
                    }
                }.awaitAll()
            }

            // Busca equipamentos reais em PARALELO apenas para endereços sem cache local no Room (ou em forceRefresh manual)
            val equipmentsMap = java.util.concurrent.ConcurrentHashMap<String, MutableList<com.google.firebase.firestore.DocumentSnapshot>>()
            val localCachedEquipsMap = java.util.concurrent.ConcurrentHashMap<String, List<com.lefrio.atendimento.data.local.dao.AddressEquipmentResult>>()
            val addressesNeedingEquipFetch = mutableListOf<String>()

            for (aid in matchedAddressIds) {
                val cleanAid = aid.trim()
                if (cleanAid.isBlank()) continue
                if (!forceRefresh) {
                    val localEquips = try {
                        checklistDao.getDistinctEquipmentsForAddress(cleanAid).filter { !it.id.startsWith("EQ_") }
                    } catch (_: Exception) { emptyList() }
                    if (localEquips.isNotEmpty()) {
                        localCachedEquipsMap[cleanAid] = localEquips
                        continue
                    }
                }
                addressesNeedingEquipFetch.add(cleanAid)
            }

            coroutineScope {
                addressesNeedingEquipFetch.map { cleanAid ->
                    async {
                        try {
                            val eqSnap = firestore.collection("equipments").whereEqualTo("addressId", cleanAid).get().await()
                            for (eqDoc in eqSnap.documents) {
                                val isActive = eqDoc.getBoolean("active") ?: true
                                if (isActive && eqDoc.getString("status") != "deactivated") {
                                    equipmentsMap.getOrPut(cleanAid) { java.util.Collections.synchronizedList(mutableListOf()) }.add(eqDoc)
                                    val eqName = eqDoc.getString("name") ?: eqDoc.getString("label") ?: "Ar Condicionado Split"
                                    val opt = EquipmentOption(
                                        id = eqDoc.id,
                                        addressId = cleanAid,
                                        name = eqName,
                                        brand = eqDoc.getString("brand"),
                                        sector = eqDoc.getString("sector"),
                                        btu = eqDoc.getString("btus")
                                    )
                                    val existingList = cachedEquipmentsByAddress.getOrPut(cleanAid) { java.util.Collections.synchronizedList(mutableListOf()) }
                                    synchronized(existingList) {
                                        if (existingList.none { it.id == opt.id }) {
                                            existingList.add(opt)
                                        }
                                    }
                                }
                            }
                        } catch (_: Exception) {}
                    }
                }.awaitAll()
            }

            // Constrói as ordens de manutenção preventiva com extração inteligente de dados embutidos
            for (doc in matchedDocs) {
                val orderId = "PREV_${doc.id}"
                val addrId = (doc.getString("addressId") ?: "").trim().ifBlank { "ADDR_${doc.id}" }
                val addrDoc = addressMap[addrId]

                // Extração dos dados de endereço e cliente embutidos diretamente no documento
                val embeddedAddr = doc.get("address") as? Map<*, *>
                val embeddedClient = doc.get("client") as? Map<*, *>

                val embeddedStreet = embeddedAddr?.get("street") as? String
                val embeddedNumber = embeddedAddr?.get("number")?.toString()
                val embeddedNeighborhood = embeddedAddr?.get("neighborhood") as? String
                val embeddedCity = embeddedAddr?.get("city") as? String
                val embeddedTotalMachines = (embeddedAddr?.get("totalMachines") as? Number)?.toInt()
                val embeddedClientId = (embeddedAddr?.get("clientId") as? String) ?: (embeddedClient?.get("id") as? String)
                val embeddedClientName = (embeddedClient?.get("name") as? String)
                    ?: (embeddedClient?.get("fullName") as? String)

                val rawClientId = addrDoc?.getString("clientId")?.takeIf { it.isNotBlank() }
                    ?: doc.getString("clientId")?.takeIf { it.isNotBlank() }
                    ?: embeddedClientId?.takeIf { it.isNotBlank() }
                    ?: "CLI_$addrId"

                val clientName = clientMap[rawClientId]
                    ?: doc.getString("clientName")?.takeIf { it.isNotBlank() && it != "Cliente LeFrio" && it != "Cliente PMOC" && it != "Cliente LeFrio PMOC" }
                    ?: embeddedClientName?.takeIf { it.isNotBlank() }
                    ?: doc.getString("temporaryClient")?.takeIf { it.isNotBlank() }
                    ?: doc.getString("clientName")?.takeIf { it.isNotBlank() }
                    ?: "Cliente LeFrio PMOC"

                val street = doc.getString("addressStreet")?.takeIf { it.isNotBlank() && it != "Endereço Operacional" }
                    ?: addrDoc?.getString("street")?.takeIf { it.isNotBlank() }
                    ?: embeddedStreet?.takeIf { it.isNotBlank() }
                    ?: doc.getString("temporaryStreet")?.takeIf { it.isNotBlank() }
                    ?: "Endereço Operacional"

                val numVal = addrDoc?.getString("number") ?: embeddedNumber ?: ""
                val neighVal = addrDoc?.getString("neighborhood") ?: embeddedNeighborhood ?: ""
                val num = if (numVal.isNotBlank() && !street.contains(numVal)) ", $numVal" else ""
                val neigh = if (neighVal.isNotBlank() && !street.contains(neighVal)) " - $neighVal" else ""
                val city = doc.getString("addressCity")?.takeIf { it.isNotBlank() }
                    ?: addrDoc?.getString("city")?.takeIf { it.isNotBlank() }
                    ?: embeddedCity?.takeIf { it.isNotBlank() }
                    ?: "Maceió"
                val fullStreet = if (num.isNotBlank() || neigh.isNotBlank()) "$street$num$neigh".trim() else street.trim()

                val statusRaw = doc.getString("status") ?: "aberta"
                val status = when (statusRaw) {
                    "completed", "pre_completed" -> "finalizada"
                    "in_progress" -> "em_andamento"
                    else -> "aberta"
                }

                val serverRouteNotes = doc.getString("routeNotes")?.trim() ?: ""
                @Suppress("UNCHECKED_CAST")
                val serverOtherPhotos = (doc.get("otherPhotos") as? List<*>)
                    ?.mapNotNull { it as? String }
                    ?.filter { it.isNotBlank() }
                    ?: emptyList()
                if (serverOtherPhotos.isNotEmpty() && getOtherPhotos(orderId).isEmpty()) {
                    saveOtherPhotosLocalOnly(orderId, serverOtherPhotos.take(4))
                }
                val serverFiscalRole = doc.getString("clientSigneeRole")?.takeIf { it.isNotBlank() }
                    ?: doc.getString("clientRepresentativeRole")?.takeIf { it.isNotBlank() }
                val serverFiscalContact = doc.getString("clientSigneeContact")?.takeIf { it.isNotBlank() }
                    ?: doc.getString("clientRepresentativeContact")?.takeIf { it.isNotBlank() }
                if (!serverFiscalRole.isNullOrBlank() || !serverFiscalContact.isNullOrBlank()) {
                    val (existingRole, existingContact) = getFiscalExtraDraft(orderId)
                    saveFiscalExtraDraft(
                        orderId,
                        existingRole.ifBlank { serverFiscalRole.orEmpty() },
                        existingContact.ifBlank { serverFiscalContact.orEmpty() }
                    )
                }

                ordersToSave.add(
                    ServiceOrderEntity(
                        id = orderId,
                        osNumber = "PMOC-${doc.id.takeLast(4).uppercase()}",
                        originalId = doc.id,
                        clientId = rawClientId,
                        clientName = clientName,
                        addressId = addrId,
                        addressStreet = fullStreet,
                        addressCity = city,
                        plannedDate = (doc.getString("plannedDate") ?: targetDate).take(10),
                        status = status,
                        type = "MANUTENÇÃO PREVENTIVA",
                        technician1 = technicianName,
                        technician2 = doc.getString("technician2"),
                        clientRepresentative = doc.getString("clientSigneeName")?.takeIf { it.isNotBlank() },
                        clientSigneeDoc = doc.getString("clientSigneeRegistration")?.takeIf { it.isNotBlank() },
                        clientSignatureDate = doc.getString("clientSignatureDate")?.takeIf { it.isNotBlank() },
                        completionDate = doc.getString("completionDate")?.takeIf { it.isNotBlank() },
                        generalNotes = serverRouteNotes,
                        isLockedForEdit = status == "finalizada",
                        isSyncedWithServer = true
                    )
                )

                // Extrai checklist salvo no servidor para refletir máquinas já atendidas, puladas ou marcadas para remoção
                val serverChecklistByEqId = mutableMapOf<String, Map<*, *>>()
                val serverChecklistByName = mutableMapOf<String, Map<*, *>>()
                val rawChecklist = doc.get("checklist") as? List<*>
                if (rawChecklist != null) {
                    for (entry in rawChecklist) {
                        val map = entry as? Map<*, *> ?: continue
                        val cid = (map["equipmentId"] as? String)?.trim()
                        val cname = (map["name"] as? String)?.trim()?.uppercase()
                        if (!cid.isNullOrBlank()) serverChecklistByEqId[cid] = map
                        if (!cname.isNullOrBlank()) serverChecklistByName[cname] = map
                    }
                }

                val realEquips = equipmentsMap[addrId] ?: emptyList()
                val localCachedEquips = localCachedEquipsMap[addrId] ?: emptyList()
                if (realEquips.isNotEmpty()) {
                    for (eqDoc in realEquips) {
                        val eqName = eqDoc.getString("name") ?: eqDoc.getString("label") ?: "Ar Condicionado Split"
                        val srvItem = serverChecklistByEqId[eqDoc.id] ?: serverChecklistByName[eqName.trim().uppercase()]
                        val isRemoval = (srvItem?.get("requestedRemoval") as? Boolean) == true
                        checklistToSave.add(
                            EquipmentChecklistEntity(
                                id = "CHECK_${orderId}_${eqDoc.id}",
                                orderId = orderId,
                                equipmentId = eqDoc.id,
                                equipmentName = eqName,
                                equipmentBrand = eqDoc.getString("brand"),
                                equipmentBtus = eqDoc.getString("btus"),
                                equipmentSector = eqDoc.getString("sector") ?: "Geral",
                                equipmentPatrimony = eqDoc.getString("patrimony"),
                                isChecked = if (isRemoval) false else ((srvItem?.get("checked") as? Boolean) ?: false),
                                isSkipped = if (isRemoval) true else ((srvItem?.get("skipped") as? Boolean) ?: false),
                                notes = (srvItem?.get("notes") as? String) ?: "",
                                justification = if (isRemoval) REMOVAL_JUSTIFICATION_MARKER else (srvItem?.get("justification") as? String)?.takeIf { it.isNotBlank() },
                                checkedAt = (srvItem?.get("checkedAt") as? String)?.takeIf { it.isNotBlank() },
                                isSynced = true
                            )
                        )
                    }
                } else if (localCachedEquips.isNotEmpty()) {
                    for (cachedEq in localCachedEquips) {
                        val eqName = cachedEq.name.ifBlank { "Ar Condicionado Split" }
                        val srvItem = serverChecklistByEqId[cachedEq.id] ?: serverChecklistByName[eqName.trim().uppercase()]
                        val isRemoval = (srvItem?.get("requestedRemoval") as? Boolean) == true
                        checklistToSave.add(
                            EquipmentChecklistEntity(
                                id = "CHECK_${orderId}_${cachedEq.id}",
                                orderId = orderId,
                                equipmentId = cachedEq.id,
                                equipmentName = eqName,
                                equipmentBrand = cachedEq.brand,
                                equipmentBtus = cachedEq.btu,
                                equipmentSector = cachedEq.sector ?: "Geral",
                                isChecked = if (isRemoval) false else ((srvItem?.get("checked") as? Boolean) ?: false),
                                isSkipped = if (isRemoval) true else ((srvItem?.get("skipped") as? Boolean) ?: false),
                                notes = (srvItem?.get("notes") as? String) ?: "",
                                justification = if (isRemoval) REMOVAL_JUSTIFICATION_MARKER else (srvItem?.get("justification") as? String)?.takeIf { it.isNotBlank() },
                                checkedAt = (srvItem?.get("checkedAt") as? String)?.takeIf { it.isNotBlank() },
                                isSynced = true
                            )
                        )
                    }
                } else {
                    val totalMachines = addrDoc?.getLong("totalMachines")?.toInt() 
                        ?: embeddedTotalMachines 
                        ?: 4
                    val count = if (totalMachines > 0) totalMachines else 4
                    for (m in 1..count) {
                        val eqId = "EQ_${doc.id}_$m"
                        val eqName = "Ar Condicionado Split #0$m"
                        val srvItem = serverChecklistByEqId[eqId] ?: serverChecklistByName[eqName.trim().uppercase()]
                        checklistToSave.add(
                            EquipmentChecklistEntity(
                                id = "CHECK_${orderId}_${eqId}",
                                orderId = orderId,
                                equipmentId = eqId,
                                equipmentName = eqName,
                                equipmentBrand = if (m % 2 == 0) "Carrier" else "Gree",
                                equipmentBtus = if (m % 2 == 0) "12000 BTUs" else "18000 BTUs",
                                equipmentSector = "Ambiente Climatizado / Sala $m",
                                isChecked = (srvItem?.get("checked") as? Boolean) ?: false,
                                isSkipped = (srvItem?.get("skipped") as? Boolean) ?: false,
                                notes = (srvItem?.get("notes") as? String) ?: "",
                                justification = (srvItem?.get("justification") as? String)?.takeIf { it.isNotBlank() },
                                checkedAt = (srvItem?.get("checkedAt") as? String)?.takeIf { it.isNotBlank() },
                                isSynced = true
                            )
                        )
                    }
                }
            }

            // B) Busca Ordens de Serviço Corretivas filtradas pelo técnico no SERVIDOR (evita baixar O.S. de toda a empresa no 4G)
            try {
                val osCandidateMap = LinkedHashMap<String, com.google.firebase.firestore.DocumentSnapshot>()
                coroutineScope {
                    val osQueries = buildList {
                        if (normTechName.isNotBlank()) {
                            add(async {
                                try {
                                    withTimeout(10_000L) {
                                        firestore.collection("serviceOrders").whereEqualTo("technician1", normTechName).get().await().documents
                                    }
                                } catch (_: Exception) { emptyList() }
                            })
                            add(async {
                                try {
                                    withTimeout(10_000L) {
                                        firestore.collection("serviceOrders").whereEqualTo("technicianName", normTechName).get().await().documents
                                    }
                                } catch (_: Exception) { emptyList() }
                            })
                            add(async {
                                try {
                                    withTimeout(10_000L) {
                                        firestore.collection("serviceOrders").whereEqualTo("technician2", normTechName).get().await().documents
                                    }
                                } catch (_: Exception) { emptyList() }
                            })
                        }
                        if (normTechId.isNotBlank()) {
                            add(async {
                                try {
                                    withTimeout(10_000L) {
                                        firestore.collection("serviceOrders").whereEqualTo("technicianId", normTechId).get().await().documents
                                    }
                                } catch (_: Exception) { emptyList() }
                            })
                            add(async {
                                try {
                                    withTimeout(10_000L) {
                                        firestore.collection("serviceOrders").whereEqualTo("technician2Id", normTechId).get().await().documents
                                    }
                                } catch (_: Exception) { emptyList() }
                            })
                        }
                    }
                    for (docs in osQueries.awaitAll()) {
                        for (d in docs) {
                            osCandidateMap[d.id] = d
                        }
                    }
                }

                for (doc in osCandidateMap.values) {
                    val rawStatus = (doc.getString("status") ?: "aberta").trim().lowercase()
                    if (rawStatus == "cancelada") continue

                    val isTechFinalized = doc.getBoolean("techFinalized") == true ||
                        doc.getBoolean("isLockedForTech") == true ||
                        !doc.getString("techFinalizedAt").isNullOrBlank()
                    val isAdminFinalized = doc.getBoolean("adminFinalized") == true ||
                        rawStatus == "finalizada" ||
                        rawStatus == "pre_finalizada"
                    val effectiveStatus = when {
                        isTechFinalized || isAdminFinalized -> "finalizada"
                        rawStatus == "em_andamento" -> "em_andamento"
                        else -> "aberta"
                    }

                    val tId = (doc.getString("technicianId") ?: "").trim().uppercase()
                    val tName = (doc.getString("technicianName") ?: doc.getString("technician1") ?: "").trim().uppercase()
                    val t2Id = (doc.getString("technician2Id") ?: "").trim().uppercase()
                    val t2Name = (doc.getString("technician2") ?: "").trim().uppercase()
                    val pDate = (doc.getString("plannedDate") ?: (doc.getString("openedAt")?.take(10) ?: "")).trim().take(10)

                    val matchesTech = matchesTechResilient(tId, normTechName, normTechId) ||
                                      matchesTechResilient(tName, normTechName, normTechId) ||
                                      matchesTechResilient(t2Id, normTechName, normTechId) ||
                                      matchesTechResilient(t2Name, normTechName, normTechId)

                    val isFutureDate = isIsoDate(pDate) && pDate > targetDate
                    val matchesDate = !isFutureDate && (pDate.isBlank() || pDate >= minPastDate || pDate.startsWith(currentMonth))

                    if (matchesTech && matchesDate) {
                        val cId = doc.getString("clientId") ?: ""
                        val aId = doc.getString("addressId") ?: ""
                        val addrDoc = addressMap[aId]

                        val realClientName = clientMap[cId]
                            ?: doc.getString("clientName")?.takeIf { it.isNotBlank() && it != "Cliente LeFrio" && it != "Cliente PMOC" }
                            ?: "Cliente Solicitante O.S."

                        val realStreet = addrDoc?.let {
                            val s = it.getString("street") ?: ""
                            val num = it.getString("number")?.let { n -> ", $n" } ?: ""
                            val neigh = it.getString("neighborhood")?.let { nb -> " - $nb" } ?: ""
                            "$s$num$neigh".trim()
                        }?.takeIf { it.isNotBlank() } ?: doc.getString("addressStreet")?.takeIf { it.isNotBlank() && it != "Endereço do Chamado" } ?: "Endereço de Atendimento"

                        val serverFiscalName = doc.getString("clientRepresentative")?.takeIf { it.isNotBlank() }
                            ?: doc.getString("clientSigneeName")?.takeIf { it.isNotBlank() }
                        val serverFiscalDoc = doc.getString("clientSigneeDoc")?.takeIf { it.isNotBlank() }
                            ?: doc.getString("clientSigneeRegistration")?.takeIf { it.isNotBlank() }
                            ?: doc.getString("clientRepresentativeMatricula")?.takeIf { it.isNotBlank() }
                        val serverFiscalRole = doc.getString("clientRepresentativeRole")?.takeIf { it.isNotBlank() }
                            ?: doc.getString("clientSigneeRole")?.takeIf { it.isNotBlank() }
                        val serverFiscalContact = doc.getString("clientRepresentativeContact")?.takeIf { it.isNotBlank() }
                            ?: doc.getString("clientSigneeContact")?.takeIf { it.isNotBlank() }
                        if (!serverFiscalRole.isNullOrBlank() || !serverFiscalContact.isNullOrBlank()) {
                            val (existingRole, existingContact) = getFiscalExtraDraft(doc.id)
                            saveFiscalExtraDraft(
                                doc.id,
                                existingRole.ifBlank { serverFiscalRole.orEmpty() },
                                existingContact.ifBlank { serverFiscalContact.orEmpty() }
                            )
                        }
                        val serverSigDate = doc.getString("clientSignatureDate")?.takeIf { it.isNotBlank() }
                        val serverCompletionDate = doc.getString("techFinalizedAt")?.takeIf { it.isNotBlank() }
                            ?: doc.getString("completionDate")?.takeIf { it.isNotBlank() }
                            ?: doc.getString("finishedAt")?.takeIf { it.isNotBlank() }
                        val serverNotes = doc.getString("generalNotes")?.takeIf { it.isNotBlank() }
                            ?: doc.getString("description")?.takeIf { it.isNotBlank() }
                            ?: "Atendimento Corretivo Solicitado"

                        if (ordersToSave.none { it.id == doc.id }) {
                            ordersToSave.add(
                                ServiceOrderEntity(
                                    id = doc.id,
                                    osNumber = doc.getString("osNumber") ?: doc.getString("orderNumber") ?: "OS-${doc.id.takeLast(4).uppercase()}",
                                    originalId = doc.id,
                                    clientId = cId,
                                    clientName = realClientName,
                                    addressId = aId,
                                    addressStreet = realStreet,
                                    plannedDate = doc.getString("plannedDate")?.takeIf { it.isNotBlank() } ?: pDate.ifBlank { targetDate },
                                    status = effectiveStatus,
                                    type = doc.getString("type") ?: "MANUTENÇÃO CORRETIVA CONTRATO",
                                    technician1 = technicianName,
                                    technician2 = doc.getString("technician2"),
                                    clientRepresentative = serverFiscalName,
                                    clientSigneeDoc = serverFiscalDoc,
                                    clientSignatureDate = serverSigDate,
                                    completionDate = serverCompletionDate,
                                    generalNotes = serverNotes,
                                    isLockedForEdit = effectiveStatus == "finalizada",
                                    isSyncedWithServer = true
                                )
                            )
                        }
                    }
                }
            } catch (e: Exception) {
                Log.d(TAG, "Tentativa de leitura em serviceOrders (aviso): ${e.message}")
            }

            if (ordersToSave.isNotEmpty()) {
                fetchSuccess = true
            }
        } catch (e: Exception) {
            Log.w(TAG, "Tentativa direta Firestore falhou: ${e.message}")
        }

        // 2. FALLBACK VIA API CASO FIRESTORE NÃO RETORNE NADA E HAJA CONEXÃO
        if (!fetchSuccess) {
            val apiEndpoints = listOf(
                "${FirebaseConfig.SHARED_API_BASE}/api/tech-demand/itinerary?tech=${java.net.URLEncoder.encode(normTechName, "UTF-8")}&month=$currentMonth&date=$targetDate",
                "http://10.0.2.2:3000/api/tech-demand/itinerary?tech=${java.net.URLEncoder.encode(normTechName, "UTF-8")}&month=$currentMonth&date=$targetDate"
            )

            for (endpoint in apiEndpoints) {
                if (fetchSuccess) break
                try {
                    val url = java.net.URL(endpoint)
                    val conn = url.openConnection() as java.net.HttpURLConnection
                    conn.connectTimeout = 10000
                    conn.readTimeout = 15000
                    conn.requestMethod = "GET"
                    conn.setRequestProperty("Accept", "application/json")

                    if (conn.responseCode == 200) {
                        val responseStr = conn.inputStream.bufferedReader().use { it.readText() }
                        val json = JSONObject(responseStr)

                        if (json.optBoolean("success", false)) {
                            val recordsArr = json.optJSONArray("records") ?: org.json.JSONArray()
                            val addrsArr = json.optJSONArray("addresses") ?: org.json.JSONArray()
                            val clientsArr = json.optJSONArray("clients") ?: org.json.JSONArray()
                            val equipsArr = json.optJSONArray("equipments") ?: org.json.JSONArray()
                            val osArr = json.optJSONArray("serviceOrders") ?: org.json.JSONArray()

                            val addrsMap = mutableMapOf<String, JSONObject>()
                            for (i in 0 until addrsArr.length()) {
                                val a = addrsArr.getJSONObject(i)
                                val aid = a.optString("id", "")
                                if (aid.isNotBlank()) addrsMap[aid] = a
                            }

                            val clientsMap = mutableMapOf<String, JSONObject>()
                            for (i in 0 until clientsArr.length()) {
                                val c = clientsArr.getJSONObject(i)
                                val cid = c.optString("id", "")
                                if (cid.isNotBlank()) clientsMap[cid] = c
                            }

                            val equipsByAddr = mutableMapOf<String, MutableList<JSONObject>>()
                            for (i in 0 until equipsArr.length()) {
                                val eq = equipsArr.getJSONObject(i)
                                val eqAid = eq.optString("addressId", "").trim()
                                if (eqAid.isNotBlank()) {
                                    equipsByAddr.getOrPut(eqAid) { mutableListOf() }.add(eq)
                                    val opt = EquipmentOption(
                                        id = eq.optString("id", UUID.randomUUID().toString()),
                                        addressId = eqAid,
                                        name = eq.optString("name", eq.optString("label", "Equipamento")),
                                        brand = eq.optString("brand", null).takeIf { !it.isNullOrBlank() },
                                        sector = eq.optString("sector", null).takeIf { !it.isNullOrBlank() },
                                        btu = eq.optString("btus", null).takeIf { !it.isNullOrBlank() }
                                    )
                                    val existing = cachedEquipmentsByAddress.getOrPut(eqAid) { mutableListOf() }
                                    if (existing.none { it.id == opt.id }) {
                                        existing.add(opt)
                                    }
                                }
                            }

                            val apiMinPastDate = subtractDays(targetDate, 7)
                            val eligibleApiRecords = mutableListOf<JSONObject>()
                            for (i in 0 until recordsArr.length()) {
                                val rec = recordsArr.getJSONObject(i)
                                val rDate = rec.optString("plannedDate", "").trim().take(10)
                                if (isIsoDate(rDate) && rDate <= targetDate && rDate >= apiMinPastDate) {
                                    eligibleApiRecords.add(rec)
                                }
                            }
                            val apiDatesDesc = eligibleApiRecords
                                .map { it.optString("plannedDate", "").trim().take(10) }
                                .distinct()
                                .sortedDescending()
                            val apiActiveDate = when {
                                apiDatesDesc.contains(targetDate) -> targetDate
                                else -> apiDatesDesc.firstOrNull { it < targetDate && it >= apiMinPastDate }
                            }
                            val filteredApiRecords = if (apiActiveDate != null) {
                                eligibleApiRecords.filter { it.optString("plannedDate", "").trim().take(10) == apiActiveDate }
                            } else {
                                emptyList()
                            }

                            for (rec in filteredApiRecords) {
                                val recId = rec.optString("id", UUID.randomUUID().toString())
                                val addrId = rec.optString("addressId", "")
                                val addrObj = addrsMap[addrId]
                                val embeddedAddr = rec.optJSONObject("address")
                                val embeddedClient = rec.optJSONObject("client")

                                val clientId = addrObj?.optString("clientId", "")
                                    ?.takeIf { it.isNotBlank() }
                                    ?: embeddedAddr?.optString("clientId", "")?.takeIf { it.isNotBlank() }
                                    ?: embeddedClient?.optString("id", "")?.takeIf { it.isNotBlank() }
                                    ?: rec.optString("clientId", "")

                                val clientObj = if (clientId.isNotBlank()) clientsMap[clientId] else null

                                val clientName = rec.optString("clientName")
                                    .takeIf { it.isNotBlank() && it != "Cliente LeFrio" && it != "Cliente PMOC" }
                                    ?: clientObj?.optString("name")
                                    ?: clientObj?.optString("fullName")
                                    ?: embeddedClient?.optString("name")
                                    ?: embeddedClient?.optString("fullName")
                                    ?: "Cliente LeFrio PMOC"

                                val rawStreet = rec.optString("addressStreet")
                                    .takeIf { it.isNotBlank() && it != "Endereço Operacional" }
                                    ?: addrObj?.optString("street")
                                    ?: embeddedAddr?.optString("street")
                                    ?: "Endereço Operacional"

                                val num = if (rawStreet.contains(",")) "" else (addrObj?.optString("number") ?: embeddedAddr?.optString("number", "") ?: "").let { if (it.isNotBlank()) ", $it" else "" }
                                val neigh = if (rawStreet.contains("-")) "" else (addrObj?.optString("neighborhood") ?: embeddedAddr?.optString("neighborhood", "") ?: "").let { if (it.isNotBlank()) " - $it" else "" }
                                val city = addrObj?.optString("city") ?: embeddedAddr?.optString("city") ?: rec.optString("addressCity", "Maceió").ifBlank { "Maceió" }
                                val fullStreet = if (num.isNotBlank() || neigh.isNotBlank()) "$rawStreet$num$neigh".trim() else rawStreet.trim()

                                val orderId = "PREV_${recId}"
                                val statusRaw = rec.optString("status", "aberta")
                                val status = when (statusRaw) {
                                    "completed", "pre_completed" -> "finalizada"
                                    "in_progress" -> "em_andamento"
                                    else -> "aberta"
                                }

                                val apiRouteNotes = rec.optString("routeNotes", "").trim()
                                val apiOtherPhotosArr = rec.optJSONArray("otherPhotos")
                                if (apiOtherPhotosArr != null && apiOtherPhotosArr.length() > 0 && getOtherPhotos(orderId).isEmpty()) {
                                    val list = mutableListOf<String>()
                                    for (pIdx in 0 until minOf(apiOtherPhotosArr.length(), 4)) {
                                        val p = apiOtherPhotosArr.optString(pIdx, "")
                                        if (p.isNotBlank()) list.add(p)
                                    }
                                    if (list.isNotEmpty()) saveOtherPhotosLocalOnly(orderId, list)
                                }

                                ordersToSave.add(
                                    ServiceOrderEntity(
                                        id = orderId,
                                        osNumber = "PMOC-${recId.takeLast(4).uppercase()}",
                                        originalId = recId,
                                        clientId = clientId,
                                        clientName = clientName,
                                        addressId = addrId,
                                        addressStreet = fullStreet,
                                        addressCity = city,
                                        plannedDate = rec.optString("plannedDate", targetDate),
                                        status = status,
                                        type = "MANUTENÇÃO PREVENTIVA",
                                        technician1 = technicianName,
                                        technician2 = rec.optString("technician2", null),
                                        clientRepresentative = rec.optString("clientSigneeName", "").takeIf { it.isNotBlank() },
                                        clientSigneeDoc = rec.optString("clientSigneeRegistration", "").takeIf { it.isNotBlank() },
                                        clientSignatureDate = rec.optString("clientSignatureDate", "").takeIf { it.isNotBlank() },
                                        completionDate = rec.optString("completionDate", "").takeIf { it.isNotBlank() },
                                        generalNotes = apiRouteNotes,
                                        isLockedForEdit = status == "finalizada",
                                        isSyncedWithServer = true
                                    )
                                )

                                val apiChecklistByEqId = mutableMapOf<String, JSONObject>()
                                val apiChecklistArr = rec.optJSONArray("checklist")
                                if (apiChecklistArr != null) {
                                    for (cIdx in 0 until apiChecklistArr.length()) {
                                        val cObj = apiChecklistArr.optJSONObject(cIdx) ?: continue
                                        val cid = cObj.optString("equipmentId", "").trim()
                                        if (cid.isNotBlank()) apiChecklistByEqId[cid] = cObj
                                    }
                                }

                                val addrEquips = equipsByAddr[addrId] ?: emptyList()
                                if (addrEquips.isNotEmpty()) {
                                    for (eq in addrEquips) {
                                        val eqId = eq.optString("id", UUID.randomUUID().toString())
                                        val srvItem = apiChecklistByEqId[eqId]
                                        val isRemoval = srvItem?.optBoolean("requestedRemoval", false) == true
                                        checklistToSave.add(
                                            EquipmentChecklistEntity(
                                                id = "CHECK_${orderId}_${eqId}",
                                                orderId = orderId,
                                                equipmentId = eqId,
                                                equipmentName = eq.optString("name", "Ar Condicionado Split"),
                                                equipmentBrand = eq.optString("brand", null),
                                                equipmentBtus = eq.optString("btus", null),
                                                equipmentSector = eq.optString("sector", "Geral"),
                                                equipmentPatrimony = eq.optString("patrimony", null),
                                                isChecked = if (isRemoval) false else (srvItem?.optBoolean("checked", false) ?: false),
                                                isSkipped = if (isRemoval) true else (srvItem?.optBoolean("skipped", false) ?: false),
                                                notes = srvItem?.optString("notes", "") ?: "",
                                                justification = if (isRemoval) REMOVAL_JUSTIFICATION_MARKER else srvItem?.optString("justification", "")?.takeIf { it.isNotBlank() },
                                                checkedAt = srvItem?.optString("checkedAt", "")?.takeIf { it.isNotBlank() },
                                                isSynced = true
                                            )
                                        )
                                    }
                                } else {
                                    val totalMac = addrObj?.optInt("totalMachines", 4) ?: 4
                                    val count = if (totalMac > 0) totalMac else 4
                                    for (m in 1..count) {
                                        val eqId = "EQ_${recId}_$m"
                                        val srvItem = apiChecklistByEqId[eqId]
                                        checklistToSave.add(
                                            EquipmentChecklistEntity(
                                                id = "CHECK_${orderId}_${eqId}",
                                                orderId = orderId,
                                                equipmentId = eqId,
                                                equipmentName = "Ar Condicionado Split #0$m",
                                                equipmentBrand = if (m % 2 == 0) "Carrier" else "Gree",
                                                equipmentBtus = if (m % 2 == 0) "12000 BTUs" else "18000 BTUs",
                                                equipmentSector = "Setor Operacional / Sala $m",
                                                isChecked = srvItem?.optBoolean("checked", false) ?: false,
                                                isSkipped = srvItem?.optBoolean("skipped", false) ?: false,
                                                notes = srvItem?.optString("notes", "") ?: "",
                                                justification = srvItem?.optString("justification", "")?.takeIf { it.isNotBlank() },
                                                checkedAt = srvItem?.optString("checkedAt", "")?.takeIf { it.isNotBlank() },
                                                isSynced = true
                                            )
                                        )
                                    }
                                }
                            }

                            for (i in 0 until osArr.length()) {
                                val os = osArr.getJSONObject(i)
                                val osDate = os.optString("plannedDate", "").trim().take(10)
                                if (isIsoDate(osDate) && osDate > targetDate) continue
                                val osId = os.optString("id", UUID.randomUUID().toString())
                                val clientId = os.optString("clientId", "")
                                val addrId = os.optString("addressId", "")
                                val addrObj = addrsMap[addrId]
                                val clientObj = clientsMap[clientId] ?: (if (addrObj != null) clientsMap[addrObj.optString("clientId", "")] else null)

                                val resolvedClientName = clientObj?.optString("name")
                                    ?: os.optString("clientName", "").takeIf { it.isNotBlank() && it != "Cliente LeFrio" && it != "Cliente PMOC" }

                                val resolvedStreet = addrObj?.let { a ->
                                    val street = a.optString("street", "")
                                    val num = a.optString("number")?.let { ", $it" } ?: ""
                                    val neigh = a.optString("neighborhood")?.let { " - $it" } ?: ""
                                    "$street$num$neigh".trim()
                                }?.takeIf { it.isNotBlank() } ?: os.optString("addressStreet", "").takeIf { it.isNotBlank() && it != "Endereço do Chamado" }

                                if (resolvedClientName.isNullOrBlank() || resolvedStreet.isNullOrBlank()) {
                                    continue
                                }

                                val rawOsStatus = os.optString("status", "aberta").trim().lowercase()
                                if (rawOsStatus == "cancelada") continue
                                val osTechFinalized = os.optBoolean("techFinalized", false) ||
                                    os.optBoolean("isLockedForTech", false) ||
                                    os.optString("techFinalizedAt", "").isNotBlank()
                                val osAdminFinalized = os.optBoolean("adminFinalized", false) ||
                                    rawOsStatus == "finalizada" ||
                                    rawOsStatus == "pre_finalizada"
                                val effectiveOsStatus = when {
                                    osTechFinalized || osAdminFinalized -> "finalizada"
                                    rawOsStatus == "em_andamento" -> "em_andamento"
                                    else -> "aberta"
                                }

                                ordersToSave.add(
                                    ServiceOrderEntity(
                                        id = osId,
                                        osNumber = os.optString("orderNumber", os.optString("osNumber", "OS-${osId.takeLast(4)}")),
                                        originalId = osId,
                                        clientId = clientId,
                                        clientName = resolvedClientName,
                                        addressId = addrId,
                                        addressStreet = resolvedStreet,
                                        plannedDate = os.optString("plannedDate", targetDate).ifBlank { targetDate },
                                        status = effectiveOsStatus,
                                        type = os.optString("type", "ORDEM DE SERVIÇO"),
                                        technician1 = technicianName,
                                        technician2 = os.optString("technician2", null),
                                        clientRepresentative = os.optString("clientRepresentative", "").ifBlank { os.optString("clientSigneeName", "") }.takeIf { it.isNotBlank() },
                                        clientSigneeDoc = os.optString("clientSigneeDoc", "").ifBlank { os.optString("clientSigneeRegistration", "") }.ifBlank { os.optString("clientRepresentativeMatricula", "") }.takeIf { it.isNotBlank() },
                                        clientSignatureDate = os.optString("clientSignatureDate", "").takeIf { it.isNotBlank() },
                                        completionDate = os.optString("techFinalizedAt", "").ifBlank { os.optString("completionDate", "") }.ifBlank { os.optString("finishedAt", "") }.takeIf { it.isNotBlank() },
                                        generalNotes = os.optString("generalNotes", "").ifBlank { os.optString("description", "Atendimento Corretivo Solicitado") },
                                        isLockedForEdit = effectiveOsStatus == "finalizada",
                                        isSyncedWithServer = true
                                    )
                                )
                            }

                            serverQuerySucceeded = true
                            fetchSuccess = true
                        }
                    }
                } catch (e: Exception) {
                    Log.w(TAG, "Tentativa fallback API falhou: ${e.message}")
                }
            }
        }

        // 3. Reconciliação inteligente com o banco Room:
        //    - Remove agendamentos que foram excluídos ou desvinculados pelo administrativo
        //    - Preserva 100% de trabalhos offline ainda não enviados na fila (incluindo QUARANTINED)
        val pendingTasks = syncDao.getAllUnfinishedTasks()
        val pendingRefIds = pendingTasks.map { it.referenceId }.toSet()
        val pendingOrderIds = mutableSetOf<String>()
        for (t in pendingTasks) {
            pendingOrderIds.add(t.referenceId)
            try {
                val p = JSONObject(t.payloadJson)
                val oid = p.optString("orderId", "")
                if (oid.isNotBlank()) pendingOrderIds.add(oid)
            } catch (_: Exception) {}
        }

        if (serverQuerySucceeded) {
            val validServerOrderIds = ordersToSave.map { it.id }.toSet()
            val allLocalOrders = orderDao.getAllOrders()
            for (localOrder in allLocalOrders) {
                if (localOrder.id !in validServerOrderIds) {
                    val hasPendingSync = localOrder.id in pendingOrderIds || !localOrder.isSyncedWithServer
                    // REGRA DE INTEGRIDADE ABSOLUTA:
                    // NUNCA apaga nenhum atendimento (preventivo ou corretivo) que possua alterações locais não enviadas!
                    // Apenas atendimentos já 100% sincronizados que saíram do roteiro no servidor são removidos.
                    if (!hasPendingSync) {
                        Log.d(TAG, "Removendo agendamento excluído/desvinculado no servidor: ${localOrder.id} (${localOrder.clientName})")
                        checklistDao.deleteChecklistsForOrder(localOrder.id)
                        orderDao.deleteOrderById(localOrder.id)
                    } else {
                        Log.w(TAG, "Preservando atendimento com dados offline pendentes de envio: ${localOrder.id} (${localOrder.clientName})")
                    }
                }
            }
        }

        // Lemos os checklists locais restantes após limpeza dos agendamentos excluídos
        val allLocalChecklists = checklistDao.getAllChecklists()
        val localById = allLocalChecklists.associateBy { it.id }
        val localByOrderAndEq = allLocalChecklists.associateBy { "${it.orderId}___${it.equipmentId}" }
        val localByOrderAndName = allLocalChecklists.associateBy { "${it.orderId}___${it.equipmentName.trim().uppercase()}" }

        // Primeiro: Atualiza/insere ordens de serviço respeitando ações do admin (reabertura) e preservando trabalho offline pendente
        if (ordersToSave.isNotEmpty()) {
            for (i in ordersToSave.indices) {
                val incoming = ordersToSave[i]
                val existing = orderDao.getOrderById(incoming.id)
                if (existing != null) {
                    val hasLocalUnsyncedWork = !existing.isSyncedWithServer || existing.id in pendingOrderIds
                    if (hasLocalUnsyncedWork) {
                        ordersToSave[i] = incoming.copy(
                            status = if (existing.status == "finalizada" || existing.status == "em_andamento") existing.status else incoming.status,
                            generalNotes = if (!existing.generalNotes.isNullOrBlank()) existing.generalNotes else incoming.generalNotes,
                            clientRepresentative = if (!existing.clientRepresentative.isNullOrBlank()) existing.clientRepresentative else incoming.clientRepresentative,
                            clientSigneeDoc = if (!existing.clientSigneeDoc.isNullOrBlank()) existing.clientSigneeDoc else incoming.clientSigneeDoc,
                            clientSignatureDate = existing.clientSignatureDate ?: incoming.clientSignatureDate,
                            clientSignaturePath = existing.clientSignaturePath ?: incoming.clientSignaturePath,
                            completionDate = existing.completionDate ?: incoming.completionDate,
                            completionLatitude = if (existing.completionLatitude != null && existing.completionLatitude != 0.0) existing.completionLatitude else incoming.completionLatitude,
                            completionLongitude = if (existing.completionLongitude != null && existing.completionLongitude != 0.0) existing.completionLongitude else incoming.completionLongitude,
                            completionAccuracy = if (existing.completionAccuracy != null && existing.completionAccuracy != 0f) existing.completionAccuracy else incoming.completionAccuracy,
                            isLockedForEdit = existing.isLockedForEdit || incoming.isLockedForEdit,
                            isSyncedWithServer = false
                        )
                    } else {
                        val reopenedByAdmin = existing.status == "finalizada" && incoming.status == "aberta"
                        ordersToSave[i] = incoming.copy(
                            status = if (reopenedByAdmin) "aberta" else if (incoming.status == "finalizada") "finalizada" else if (existing.status == "em_andamento") "em_andamento" else incoming.status,
                            generalNotes = if (reopenedByAdmin) incoming.generalNotes else if (!existing.generalNotes.isNullOrBlank()) existing.generalNotes else incoming.generalNotes,
                            clientRepresentative = incoming.clientRepresentative ?: if (reopenedByAdmin) null else existing.clientRepresentative,
                            clientSigneeDoc = incoming.clientSigneeDoc ?: if (reopenedByAdmin) null else existing.clientSigneeDoc,
                            clientSignatureDate = if (reopenedByAdmin) null else (incoming.clientSignatureDate ?: existing.clientSignatureDate),
                            clientSignaturePath = if (reopenedByAdmin) null else (existing.clientSignaturePath ?: incoming.clientSignaturePath),
                            completionDate = if (reopenedByAdmin) null else (incoming.completionDate ?: existing.completionDate),
                            completionLatitude = if (reopenedByAdmin) null else (existing.completionLatitude ?: incoming.completionLatitude),
                            completionLongitude = if (reopenedByAdmin) null else (existing.completionLongitude ?: incoming.completionLongitude),
                            completionAccuracy = if (reopenedByAdmin) null else (existing.completionAccuracy ?: incoming.completionAccuracy),
                            isLockedForEdit = if (reopenedByAdmin) false else (incoming.status == "finalizada"),
                            isSyncedWithServer = true
                        )
                    }
                }
            }
            orderDao.insertAll(ordersToSave)
        }

        // Segundo: Processa checklists refletindo estado real do servidor e preservando marcações offline pendentes
        if (checklistToSave.isNotEmpty()) {
            val processedOrderIds = ordersToSave.map { it.id }.toSet()
            val finalChecklistMap = mutableMapOf<String, EquipmentChecklistEntity>()

            for (incoming in checklistToSave) {
                val existing = localById[incoming.id]
                    ?: localByOrderAndEq["${incoming.orderId}___${incoming.equipmentId}"]
                    ?: localByOrderAndName["${incoming.orderId}___${incoming.equipmentName.trim().uppercase()}"]

                if (existing != null) {
                    val hasLocalUnsyncedChecklist = !existing.isSynced || existing.id in pendingRefIds || existing.orderId in pendingOrderIds
                    val merged = if (hasLocalUnsyncedChecklist) {
                        incoming.copy(
                            id = existing.id,
                            equipmentId = existing.equipmentId,
                            equipmentPatrimony = incoming.equipmentPatrimony ?: existing.equipmentPatrimony,
                            isChecked = existing.isChecked || incoming.isChecked,
                            isSkipped = existing.isSkipped || incoming.isSkipped,
                            notes = if (existing.notes.isNotBlank()) existing.notes else incoming.notes,
                            justification = existing.justification ?: incoming.justification,
                            checkedAt = existing.checkedAt ?: incoming.checkedAt,
                            localPhotoPathsJson = if (existing.localPhotoPathsJson != "[]") existing.localPhotoPathsJson else incoming.localPhotoPathsJson,
                            remotePhotoUrlsJson = if (existing.remotePhotoUrlsJson != "[]") existing.remotePhotoUrlsJson else incoming.remotePhotoUrlsJson,
                            isSynced = false
                        )
                    } else {
                        incoming.copy(
                            id = existing.id,
                            equipmentId = existing.equipmentId,
                            equipmentPatrimony = incoming.equipmentPatrimony ?: existing.equipmentPatrimony,
                            localPhotoPathsJson = if (existing.localPhotoPathsJson != "[]") existing.localPhotoPathsJson else incoming.localPhotoPathsJson,
                            remotePhotoUrlsJson = if (existing.remotePhotoUrlsJson != "[]") existing.remotePhotoUrlsJson else incoming.remotePhotoUrlsJson,
                            isSynced = true
                        )
                    }
                    finalChecklistMap[merged.id] = merged
                } else {
                    finalChecklistMap[incoming.id] = incoming
                }
            }

            // Mantém eventuais itens locais ainda não enviados para essas ordens
            for (localItem in allLocalChecklists) {
                if (localItem.orderId in processedOrderIds && !finalChecklistMap.containsKey(localItem.id)) {
                    if (!localItem.isSynced || localItem.id in pendingRefIds) {
                        finalChecklistMap[localItem.id] = localItem
                    }
                }
            }

            checklistDao.insertAll(finalChecklistMap.values.toList())
        }

            if (serverQuerySucceeded) {
                lastItinerarySyncAt = System.currentTimeMillis()
                lastItinerarySyncKey = syncKey
            }

            return@withLock ordersToSave.size
        }
    }

    /**
     * Atualiza o status do atendimento (ex: iniciar atendimento 'em_andamento').
     */
    suspend fun updateOrderStatus(orderId: String, newStatus: String) {
        orderDao.updateStatus(orderId, newStatus)

        val payload = JSONObject().apply {
            put("status", newStatus)
        }

        syncDao.deletePendingByTypeAndRef("ORDER_STATUS", orderId)
        syncDao.enqueue(
            SyncQueueEntity(
                entityType = "ORDER_STATUS",
                referenceId = orderId,
                actionType = "UPDATE",
                payloadJson = payload.toString()
            )
        )

        SyncWorker.triggerImmediateSync(context)
    }

    /**
     * Salva o rascunho dos dados do fiscal (Nome e Matrícula/CPF) imediatamente no Room.
     * Garante que caso o usuário volte para a tela inicial, nada seja perdido.
     */
    suspend fun saveFiscalDraft(orderId: String, fiscalName: String, fiscalDoc: String) = withContext(Dispatchers.IO) {
        orderDao.updateFiscalDraft(orderId, fiscalName, fiscalDoc)
    }

    /**
     * Lê Função e E-mail/Contato do fiscal salvos localmente via SharedPreferences (sem alteração de schema Room).
     */
    fun getFiscalExtraDraft(orderId: String): Pair<String, String> {
        val role = extrasPrefs.getString("fiscal_role_$orderId", "") ?: ""
        val contact = extrasPrefs.getString("fiscal_contact_$orderId", "") ?: ""
        return Pair(role, contact)
    }

    /**
     * Salva Função e E-mail/Contato do fiscal localmente no aparelho.
     */
    fun saveFiscalExtraDraft(orderId: String, role: String, contact: String) {
        extrasPrefs.edit()
            .putString("fiscal_role_$orderId", role)
            .putString("fiscal_contact_$orderId", contact)
            .apply()
    }

    /**
     * Lê as fotos gerais de observação ("Outros", até 4 imagens) salvas localmente para o atendimento.
     */
    fun getOtherPhotos(orderId: String): List<String> {
        val raw = extrasPrefs.getString("other_photos_$orderId", null) ?: return emptyList()
        return try {
            val arr = JSONArray(raw)
            val list = mutableListOf<String>()
            for (i in 0 until arr.length()) {
                val p = arr.optString(i, "")
                if (p.isNotBlank()) list.add(p)
            }
            list
        } catch (_: Exception) {
            emptyList()
        }
    }

    private fun saveOtherPhotosLocalOnly(orderId: String, photoPaths: List<String>) {
        val arr = JSONArray()
        photoPaths.take(4).forEach { arr.put(it) }
        extrasPrefs.edit().putString("other_photos_$orderId", arr.toString()).apply()
    }

    /**
     * Salva as fotos gerais de observação ("Outros") 100% localmente no aparelho.
     * No Modelo Híbrido, as fotos são consolidadas e enviadas em pacote único na finalização do atendimento.
     */
    suspend fun saveOtherPhotos(orderId: String, photoPaths: List<String>) = withContext(Dispatchers.IO) {
        val limited = photoPaths.take(4)
        saveOtherPhotosLocalOnly(orderId, limited)
    }

    /**
     * Salva o Relato Técnico (observações gerais) 100% localmente no Room (sem consumo de 4G durante digitação).
     * Enviado consolidado na finalização do atendimento.
     */
    suspend fun saveGeneralNotes(orderId: String, notes: String) = withContext(Dispatchers.IO) {
        orderDao.updateGeneralNotes(orderId, notes)
    }

    /**
     * Cadastra uma nova máquina encontrada em campo (100% Offline-First).
     * Grava imediatamente no checklist local Room e enfileira criação em 'equipments' + vínculo em 'maintenanceRecords'.
     */
    suspend fun addEquipmentToOrder(
        orderId: String,
        addressId: String,
        sector: String,
        name: String,
        brand: String,
        btus: String,
        patrimony: String
    ): EquipmentChecklistEntity = withContext(Dispatchers.IO) {
        val existingItems = checklistDao.getChecklistForOrder(orderId)
        val nextNum = existingItems.size + 1
        val resolvedLabel = nextNum.toString().padStart(2, '0')
        val cleanName = name.trim().ifBlank { "SPLIT HI-WALL" }
        val cleanSector = sector.trim().ifBlank { "Geral" }
        val cleanBrand = brand.trim().ifBlank { "Não informada" }
        val cleanBtus = btus.trim().ifBlank { "12000" }
        val cleanPatrimony = patrimony.trim()

        val equipmentId = "TECH_EQ_${System.currentTimeMillis()}_${(100..999).random()}"
        val checklistId = "CHECK_${orderId}_${equipmentId}"

        val entity = EquipmentChecklistEntity(
            id = checklistId,
            orderId = orderId,
            equipmentId = equipmentId,
            equipmentName = cleanName,
            equipmentBrand = cleanBrand,
            equipmentBtus = cleanBtus,
            equipmentSector = cleanSector,
            equipmentPatrimony = cleanPatrimony.ifBlank { null },
            isChecked = false,
            isSkipped = false,
            notes = "Adicionado pelo técnico na visita",
            justification = null,
            checkedAt = null,
            localPhotoPathsJson = "[]",
            isSynced = false,
            updatedAt = System.currentTimeMillis()
        )

        // 1. Grava imediatamente no banco local Room (funciona 100% sem internet)
        checklistDao.insertOrUpdate(entity)

        // Atualiza cache em memória de equipamentos do endereço
        if (addressId.isNotBlank()) {
            val existingCache = cachedEquipmentsByAddress.getOrPut(addressId) { java.util.Collections.synchronizedList(mutableListOf()) }
            synchronized(existingCache) {
                existingCache.add(
                    EquipmentOption(
                        id = equipmentId,
                        addressId = addressId,
                        name = cleanName,
                        brand = cleanBrand,
                        sector = cleanSector,
                        btu = cleanBtus
                    )
                )
            }
        }

        // 2. Enfileira na sync_queue para envio seguro ao Firestore ('equipments' + 'maintenanceRecords')
        val existingOrder = orderDao.getOrderById(orderId)
        val payload = JSONObject().apply {
            put("equipmentId", equipmentId)
            put("checklistId", checklistId)
            put("orderId", orderId)
            put("originalRecordId", existingOrder?.originalId ?: orderId.removePrefix("PREV_"))
            put("addressId", addressId)
            put("name", cleanName)
            put("label", resolvedLabel)
            put("patrimony", cleanPatrimony)
            put("sector", cleanSector)
            put("brand", cleanBrand)
            put("btus", cleanBtus)
            put("notes", "Adicionado pelo técnico na visita")
        }

        syncDao.enqueue(
            SyncQueueEntity(
                entityType = "ADD_EQUIPMENT",
                referenceId = equipmentId,
                actionType = "CREATE",
                payloadJson = payload.toString()
            )
        )

        // Modelo Híbrido: equipamento novo permanece salvo localmente na fila e será enviado antes da finalização do endereço
        entity
    }

    /**
     * Marca ou desmarca solicitação de remoção de uma máquina que não existe no local (igual ao PWA).
     */
    suspend fun toggleEquipmentRemoval(item: EquipmentChecklistEntity) = withContext(Dispatchers.IO) {
        val currentlyRemoval = item.isRemovalRequested()
        val nowIso = SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", Locale.getDefault()).apply {
            timeZone = java.util.TimeZone.getTimeZone("UTC")
        }.format(Date())

        val currentPhotos = try {
            val arr = JSONArray(item.localPhotoPathsJson)
            List(arr.length()) { idx -> arr.optString(idx, "") }.filter { it.isNotBlank() }
        } catch (_: Exception) {
            emptyList()
        }

        saveEquipmentChecklist(
            checklistId = item.id,
            orderId = item.orderId,
            equipmentId = item.equipmentId,
            isChecked = false,
            isSkipped = !currentlyRemoval,
            notes = item.notes,
            justification = if (!currentlyRemoval) REMOVAL_JUSTIFICATION_MARKER else null,
            checkedAt = if (!currentlyRemoval) nowIso else null,
            localPhotoPaths = currentPhotos
        )
    }

    /**
     * Grava a inspeção de um equipamento no checklist com garantia local imediata.
     */
    suspend fun saveEquipmentChecklist(
        checklistId: String,
        orderId: String,
        equipmentId: String,
        isChecked: Boolean,
        isSkipped: Boolean,
        notes: String,
        justification: String?,
        checkedAt: String?,
        localPhotoPaths: List<String>
    ) = withContext(Dispatchers.IO) {
        val photosJson = org.json.JSONArray(localPhotoPaths).toString()

        val existing = checklistDao.getChecklistById(checklistId)
            ?: checklistDao.getChecklistByOrderAndEquipment(orderId, equipmentId)

        if (existing != null) {
            checklistDao.updateChecklistExecution(
                id = existing.id,
                isChecked = isChecked,
                isSkipped = isSkipped,
                notes = notes,
                justification = justification,
                checkedAt = checkedAt,
                localPhotoPathsJson = photosJson
            )
        } else {
            checklistDao.insertOrUpdate(
                EquipmentChecklistEntity(
                    id = checklistId,
                    orderId = orderId,
                    equipmentId = equipmentId,
                    equipmentName = "Ar Condicionado Split",
                    isChecked = isChecked,
                    isSkipped = isSkipped,
                    notes = notes,
                    justification = justification,
                    checkedAt = checkedAt,
                    localPhotoPathsJson = photosJson,
                    isSynced = false
                )
            )
        }

        // Se pelo menos 1 máquina for atendida/pulada e a O.S. estiver aberta, atualiza para 'em_andamento'
        // e envia apenas o marco leve de INÍCIO (< 1 KB), sem trafegar checklist item a item no 4G.
        val currentOrder = orderDao.getOrderById(orderId)
        if (currentOrder != null && currentOrder.status == "aberta" && (isChecked || isSkipped)) {
            orderDao.updateStatus(orderId, "em_andamento")
            val statusPayload = JSONObject().apply {
                put("status", "em_andamento")
            }
            syncDao.deletePendingByTypeAndRef("ORDER_STATUS", orderId)
            syncDao.enqueue(
                SyncQueueEntity(
                    entityType = "ORDER_STATUS",
                    referenceId = orderId,
                    actionType = "UPDATE",
                    payloadJson = statusPayload.toString()
                )
            )
            SyncWorker.triggerImmediateSync(context)
        }
    }

    suspend fun getChecklistForOrderSync(orderId: String): List<EquipmentChecklistEntity> = withContext(Dispatchers.IO) {
        checklistDao.getChecklistForOrder(orderId)
    }

    /**
     * Finaliza o atendimento com assinatura digital do cliente e auditoria GPS.
     * Grava localmente (offline-first) e, havendo conexão, sincroniza IMEDIATAMENTE com o Firestore
     * para aparecer na aba Aprovação e disparar a notificação ao administrativo sem atraso.
     */
    suspend fun finalizeServiceOrder(
        orderId: String,
        signeeName: String,
        signeeDoc: String,
        signeeRole: String = "",
        signeeContact: String = "",
        signatureDate: String,
        signatureFilePath: String,
        completionDate: String,
        latitude: Double,
        longitude: Double,
        accuracy: Float,
        signatureBase64: String? = null,
        checklistItems: List<EquipmentChecklistEntity>? = null,
        routeNotes: String? = null,
        otherPhotoPaths: List<String>? = null
    ): Boolean = withContext(Dispatchers.IO) {
        val existingOrder = orderDao.getOrderById(orderId)
        val isPreventive = existingOrder?.type?.contains("PREVENTIVA", ignoreCase = true) == true || orderId.startsWith("PREV_")
        val originalRecordId = existingOrder?.originalId ?: orderId.removePrefix("PREV_")
        val addressId = existingOrder?.addressId ?: ""
        val plannedDate = existingOrder?.plannedDate ?: ""
        val month = if (plannedDate.length >= 7) plannedDate.substring(0, 7) else SimpleDateFormat("yyyy-MM", Locale.getDefault()).format(Date())

        val (savedRole, savedContact) = getFiscalExtraDraft(orderId)
        val effectiveSigneeRole = signeeRole.trim().ifBlank { savedRole.trim() }.uppercase(Locale.getDefault())
        val effectiveSigneeContact = signeeContact.trim().ifBlank { savedContact.trim() }.uppercase(Locale.getDefault())
        saveFiscalExtraDraft(orderId, effectiveSigneeRole, effectiveSigneeContact)

        val legacyDefaultNote = "Manutenção Preventiva Periódica PMOC - Higienização, Testes e Revisão"
        val effectiveRouteNotes = (routeNotes ?: existingOrder?.generalNotes ?: "")
            .let { if (it.trim() == legacyDefaultNote) "" else it.trim() }

        val effectiveOtherPhotos = (otherPhotoPaths ?: getOtherPhotos(orderId)).take(4)
        saveOtherPhotosLocalOnly(orderId, effectiveOtherPhotos)

        val effectiveChecklist = if (!checklistItems.isNullOrEmpty()) {
            checklistItems
        } else {
            checklistDao.getChecklistForOrder(orderId)
        }

        // 1. PERSISTÊNCIA LOCAL IMEDIATA E ATÔMICA NO SQLITE (ROOM) — NUNCA DEPENDE DE INTERNET!
        orderDao.updateGeneralNotes(orderId, effectiveRouteNotes)
        orderDao.finalizeOrderWithSignature(
            orderId = orderId,
            signeeName = signeeName,
            signeeDoc = signeeDoc,
            signatureDate = signatureDate,
            signaturePath = signatureFilePath,
            completionDate = completionDate,
            latitude = latitude,
            longitude = longitude,
            accuracy = accuracy
        )

        val checklistArr = JSONArray()
        effectiveChecklist.forEach { item ->
            val isRemovalReq = item.isRemovalRequested()
            val itemPhotosArr = try {
                JSONArray(item.localPhotoPathsJson)
            } catch (_: Exception) {
                JSONArray()
            }
            val obj = JSONObject().apply {
                put("equipmentId", item.equipmentId)
                put("checked", if (isRemovalReq) false else item.isChecked)
                put("skipped", if (isRemovalReq) false else item.isSkipped)
                put("requestedRemoval", isRemovalReq)
                put("justification", if (isRemovalReq) "" else (item.justification ?: ""))
                put("notes", item.notes ?: "")
                put("checkedAt", item.checkedAt ?: completionDate)
                put("localPhotoPaths", itemPhotosArr)
            }
            checklistArr.put(obj)
        }

        val executedQty = effectiveChecklist.count { it.isChecked && !it.isSkipped && !it.isRemovalRequested() }

        val payload = JSONObject().apply {
            put("clientRepresentative", signeeName)
            put("clientSigneeName", signeeName)
            put("clientSigneeDoc", signeeDoc)
            put("clientSigneeRegistration", signeeDoc)
            put("clientRepresentativeRole", effectiveSigneeRole)
            put("clientSigneeRole", effectiveSigneeRole)
            put("clientRepresentativeContact", effectiveSigneeContact)
            put("clientSigneeContact", effectiveSigneeContact)
            put("clientSignatureDate", signatureDate)
            put("signatureFilePath", signatureFilePath)
            put("completionDate", completionDate)
            put("finishedAt", completionDate)
            put("techFinalizedAt", completionDate)
            put("completionLatitude", latitude)
            put("completionLongitude", longitude)
            put("completionAccuracy", accuracy.toDouble())
            put("isPreventive", isPreventive)
            put("originalRecordId", originalRecordId)
            put("addressId", addressId)
            put("month", month)
            put("technician1", existingOrder?.technician1 ?: "")
            put("technician2", existingOrder?.technician2 ?: "")
            put("clientName", existingOrder?.clientName ?: "")
            put("addressStreet", existingOrder?.addressStreet ?: "")
            put("osNumber", existingOrder?.osNumber ?: "")
            put("executedQuantity", executedQty)
            put("routeNotes", effectiveRouteNotes)
            put("otherPhotoPaths", JSONArray(effectiveOtherPhotos))
            put("checklist", checklistArr)
            if (!signatureBase64.isNullOrBlank()) {
                put("clientSignature", signatureBase64)
            }
        }

        // 2. Compactação imediata da fila: descarta pendências intermediárias obsoletas desta ordem
        syncDao.deleteRedundantTasksForOrder(orderId)
        syncDao.deletePendingByTypeAndRef("FINALIZE_SERVICE", orderId)
        syncDao.enqueue(
            SyncQueueEntity(
                entityType = "FINALIZE_SERVICE",
                referenceId = orderId,
                actionType = "FINALIZE",
                payloadJson = payload.toString()
            )
        )

        // 3. Desacoplamento total da UI: agenda envio assíncrono via WorkManager (política KEEP)
        // sem bloquear a tela em 4G fraco, liberando o técnico instantaneamente (< 150 ms).
        SyncWorker.triggerImmediateSync(context)

        return@withContext NetworkMonitor.hasValidatedInternet(context)
    }

    // --- OPERAÇÕES DE DESPESAS DE ROTA ---

    fun getExpensesByTechnician(techId: String): Flow<List<RouteExpenseEntity>> {
        return db.routeExpenseDao().getExpensesByTechnician(techId)
    }

    fun getTotalExpensesByTechnician(techId: String): Flow<Double?> {
        return db.routeExpenseDao().getTotalExpensesByTechnician(techId)
    }

    suspend fun saveRouteExpense(expense: RouteExpenseEntity) {
        db.routeExpenseDao().insertExpense(expense)

        val payload = JSONObject().apply {
            put("id", expense.id)
            put("technicianId", expense.technicianId)
            put("technicianName", expense.technicianName)
            put("category", expense.category)
            put("amount", expense.amount)
            put("description", expense.description)
            put("date", expense.date)
            put("orderId", expense.orderId ?: "")
            put("status", expense.status)
        }

        syncDao.enqueue(
            SyncQueueEntity(
                entityType = "ROUTE_EXPENSE",
                referenceId = expense.id,
                actionType = "CREATE",
                payloadJson = payload.toString()
            )
        )

        SyncWorker.triggerImmediateSync(context)
    }

    suspend fun deleteRouteExpense(id: String) {
        db.routeExpenseDao().deleteExpense(id)
    }

    // --- OPERAÇÕES DE NOTIFICAÇÕES TÉCNICAS E CHAMADOS ---

    fun getAllNotifications(): Flow<List<TechNotificationEntity>> {
        return db.techNotificationDao().getAllNotifications()
    }

    fun getUnreadNotificationCount(): Flow<Int> {
        return db.techNotificationDao().getUnreadCount()
    }

    suspend fun markNotificationAsRead(id: String) {
        db.techNotificationDao().markAsRead(id)
    }

    suspend fun markAllNotificationsAsRead() {
        db.techNotificationDao().markAllAsRead()
    }

    suspend fun addNotification(notification: TechNotificationEntity) {
        db.techNotificationDao().insertNotification(notification)
    }

    // --- OPERAÇÕES DE CRIAÇÃO E GESTÃO DE ORDENS DE SERVIÇO ---

    suspend fun createServiceOrder(params: CreateServiceOrderParams): ServiceOrderEntity {
        val timestamp = System.currentTimeMillis()
        val randomSuffix = (1000..9999).random()
        val orderId = "OS_${timestamp}_$randomSuffix"
        
        // Gera número de OS legível
        val shortSeq = (1000 + (timestamp % 9000)).toString()
        val osNumber = "OS-$shortSeq"

        val nowIso = SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", Locale.getDefault()).apply {
            timeZone = TimeZone.getTimeZone("UTC")
        }.format(Date())
        val hasSignature = !params.signaturePath.isNullOrBlank() || !params.signatureBase64.isNullOrBlank()
        val isFinal = params.isFinalized || hasSignature
        val status = if (isFinal) "finalizada" else "aberta"
        val completionDate = if (isFinal) nowIso else null

        val cleanTechnicalReport = params.technicalReport?.trim()?.uppercase(Locale.getDefault()).orEmpty()
        val cleanFiscalRole = params.fiscalRole?.trim()?.uppercase(Locale.getDefault()).orEmpty()
        val cleanFiscalContact = params.fiscalContact?.trim()?.uppercase(Locale.getDefault()).orEmpty()

        val fullNotes = buildString {
            append("MOTIVO / DESCRIÇÃO: ${params.description.ifBlank { "Atendimento técnico no local" }}")
            if (!params.diagnosis.isNullOrBlank()) {
                append("\nDIAGNÓSTICO DA MÁQUINA: ${params.diagnosis}")
            }
            if (!params.solution.isNullOrBlank()) {
                append("\nSOLUÇÃO APLICADA: ${params.solution}")
            }
            if (cleanTechnicalReport.isNotBlank()) {
                append("\nRELATÓRIO TÉCNICO: $cleanTechnicalReport")
            }
        }

        val entity = ServiceOrderEntity(
            id = orderId,
            osNumber = osNumber,
            originalId = orderId,
            clientId = params.clientId,
            clientName = params.clientName,
            addressId = params.addressId,
            addressStreet = params.addressStreet,
            plannedDate = params.plannedDate,
            status = status,
            type = params.type,
            technician1 = params.technicianName,
            technician2 = params.technician2Name,
            clientRepresentative = params.fiscalName,
            clientSigneeDoc = params.fiscalRegistration,
            clientSignatureDate = if (isFinal) nowIso else null,
            clientSignaturePath = params.signaturePath,
            completionDate = completionDate,
            generalNotes = fullNotes,
            isLockedForEdit = isFinal,
            isSyncedWithServer = false,
            lastModifiedAt = timestamp
        )

        // 1. Grava no banco local Room imediatamente (offline-first garantido!)
        orderDao.insertOrUpdate(entity)
        saveFiscalExtraDraft(orderId, cleanFiscalRole, cleanFiscalContact)

        // 2. Se informou equipamento, cria item no checklist inicial
        if (!params.equipmentId.isNullOrBlank()) {
            val checkId = "CHK_${orderId}_${params.equipmentId}"
            val checkItem = EquipmentChecklistEntity(
                id = checkId,
                orderId = orderId,
                equipmentId = params.equipmentId,
                equipmentName = params.equipmentName ?: "Equipamento Climatização",
                equipmentBrand = params.equipmentBrand?.takeIf { it.isNotBlank() } ?: "Principal",
                equipmentBtus = params.equipmentBtus ?: "",
                equipmentSector = params.equipmentSector?.takeIf { it.isNotBlank() } ?: "Geral",
                isChecked = isFinal,
                isSkipped = false,
                isSynced = false,
                updatedAt = timestamp
            )
            checklistDao.insertOrUpdate(checkItem)
        }

        // 3. Enfileira na fila de sincronização com todos os dados técnicos e fiscal
        val payload = JSONObject().apply {
            put("id", orderId)
            put("osNumber", osNumber)
            put("clientId", params.clientId)
            put("clientName", params.clientName)
            put("addressId", params.addressId)
            put("addressStreet", params.addressStreet)
            put("equipmentId", params.equipmentId ?: "")
            put("equipmentName", params.equipmentName ?: "")
            put("equipmentBrand", params.equipmentBrand ?: "")
            put("equipmentBtus", params.equipmentBtus ?: "")
            put("equipmentSector", params.equipmentSector ?: "")
            put("status", status)
            put("type", params.type)
            put("plannedDate", params.plannedDate)
            put("technicianId", params.technicianId)
            put("technician1", params.technicianName)
            put("technician2", params.technician2Name ?: "")
            put("description", params.description)
            put("diagnosis", params.diagnosis ?: "")
            put("solution", params.solution ?: "")
            put("technicalReport", cleanTechnicalReport)
            put("routeNotes", cleanTechnicalReport)
            put("clientRepresentative", params.fiscalName ?: "")
            put("clientSigneeName", params.fiscalName ?: "")
            put("clientSigneeRegistration", params.fiscalRegistration ?: "")
            put("clientSigneeDoc", params.fiscalRegistration ?: "")
            put("clientRepresentativeRole", cleanFiscalRole)
            put("clientSigneeRole", cleanFiscalRole)
            put("clientRepresentativeContact", cleanFiscalContact)
            put("clientSigneeContact", cleanFiscalContact)
            put("clientSignaturePath", params.signaturePath ?: "")
            put("clientSignatureDate", if (isFinal) nowIso else "")
            put("completionDate", completionDate ?: "")
            put("finishedAt", if (isFinal) nowIso else "")
            put("techFinalizedAt", if (isFinal) nowIso else "")
            put("techFinalized", isFinal)
            put("clientSignature", params.signatureBase64 ?: "")
            put("generalNotes", fullNotes)
            put("openedAt", nowIso)
            put("createdAt", nowIso)
        }

        syncDao.enqueue(
            SyncQueueEntity(
                entityType = "CREATE_SERVICE_ORDER",
                referenceId = orderId,
                actionType = "CREATE",
                payloadJson = payload.toString()
            )
        )

        // Dispara envio assíncrono em segundo plano via WorkManager (política KEEP) sem travar a tela no 4G
        SyncWorker.triggerImmediateSync(context)

        return entity
    }

    suspend fun getScheduledClientsAndAddressesForTechnician(
        technicianName: String,
        technicianId: String,
        date: String
    ): Pair<List<ClientOption>, List<AddressOption>> = withContext(Dispatchers.IO) {
        val scheduledForDate = orderDao.getScheduledLocationsForTechnicianAndDate(
            technicianName = technicianName,
            technicianId = technicianId,
            date = date
        )
        val allTechLocations = orderDao.getAllLocationsForTechnician(
            technicianName = technicianName,
            technicianId = technicianId
        )

        val combinedList = LinkedHashMap<String, com.lefrio.atendimento.data.local.dao.ScheduledLocationTuple>()
        for (item in scheduledForDate) {
            val key = "${item.clientId}_${item.addressId}"
            combinedList[key] = item
        }
        for (item in allTechLocations) {
            val key = "${item.clientId}_${item.addressId}"
            if (!combinedList.containsKey(key)) {
                combinedList[key] = item
            }
        }

        val clientMap = mutableMapOf<String, ClientOption>()
        val addressMap = mutableMapOf<String, AddressOption>()

        for (item in combinedList.values) {
            val effectiveAddressId = item.addressId.trim()
            val effectiveStreet = item.addressStreet.trim()
            if (effectiveAddressId.isBlank() || effectiveStreet.isBlank() || effectiveStreet == "Endereço do Chamado") {
                continue
            }
            val effectiveClientId = item.clientId.trim().ifBlank { "CLI_$effectiveAddressId" }
            val effectiveClientName = item.clientName.trim().takeIf {
                it.isNotBlank() && it != "Cliente LeFrio" && it != "Cliente PMOC"
            } ?: "Cliente - $effectiveStreet"

            clientMap[effectiveClientId] = ClientOption(
                id = effectiveClientId,
                name = effectiveClientName,
                document = item.clientDocument
            )
            addressMap[effectiveAddressId] = AddressOption(
                id = effectiveAddressId,
                clientId = effectiveClientId,
                street = effectiveStreet,
                city = item.addressCity
            )
        }

        // Caso o banco local Room ainda esteja vazio (ex: primeiro clique antes do término do sync),
        // busca apenas a data atual (ou mês vigente se vazio) no Firestore — nunca histórico antigo
        if (addressMap.isEmpty() && NetworkMonitor.hasValidatedInternet(context)) {
            try {
                withTimeout(8_000L) { FirebaseConfig.ensureAuthenticated() }
                val firestore = FirebaseConfig.getFirestore()
                val normTechName = technicianName.trim().uppercase()
                val normTechId = technicianId.trim().uppercase()
                val currentMonth = if (date.length >= 7) date.substring(0, 7) else "2026-11"
                val minPastDate = subtractDays(date, 7)

                val docs = mutableListOf<com.google.firebase.firestore.DocumentSnapshot>()
                val byDate = withTimeout(10_000L) {
                    firestore.collection("maintenanceRecords")
                        .whereEqualTo("plannedDate", date)
                        .get().await().documents
                }
                docs.addAll(byDate)

                val hasTechDocToday = docs.any { doc ->
                    val t1 = (doc.getString("technician1") ?: "").trim().uppercase()
                    val t2 = (doc.getString("technician2") ?: "").trim().uppercase()
                    matchesTechResilient(t1, normTechName, normTechId) || matchesTechResilient(t2, normTechName, normTechId)
                }

                if (!hasTechDocToday) {
                    val byMonth = withTimeout(10_000L) {
                        firestore.collection("maintenanceRecords")
                            .whereEqualTo("month", currentMonth)
                            .get().await().documents
                    }
                    docs.addAll(byMonth)
                }

                for (doc in docs) {
                    val t1 = (doc.getString("technician1") ?: "").trim().uppercase()
                    val t2 = (doc.getString("technician2") ?: "").trim().uppercase()
                    if (!matchesTechResilient(t1, normTechName, normTechId) && !matchesTechResilient(t2, normTechName, normTechId)) {
                        continue
                    }
                    val pDate = (doc.getString("plannedDate") ?: "").trim().take(10)
                    if (!isIsoDate(pDate) || pDate > date || pDate < minPastDate) {
                        continue
                    }
                    val addrId = (doc.getString("addressId") ?: "").trim()
                    if (addrId.isBlank()) continue

                    val embeddedAddr = doc.get("address") as? Map<*, *>
                    val embeddedClient = doc.get("client") as? Map<*, *>

                    val street = doc.getString("addressStreet")?.takeIf { it.isNotBlank() }
                        ?: (embeddedAddr?.get("street") as? String)?.takeIf { it.isNotBlank() }
                        ?: doc.getString("temporaryStreet")?.takeIf { it.isNotBlank() }
                        ?: continue

                    val city = doc.getString("addressCity")
                        ?: (embeddedAddr?.get("city") as? String)
                        ?: "Maceió"

                    val clientId = doc.getString("clientId")?.takeIf { it.isNotBlank() }
                        ?: (embeddedAddr?.get("clientId") as? String)?.takeIf { it.isNotBlank() }
                        ?: (embeddedClient?.get("id") as? String)?.takeIf { it.isNotBlank() }
                        ?: "CLI_$addrId"

                    val clientName = doc.getString("clientName")?.takeIf { it.isNotBlank() }
                        ?: (embeddedClient?.get("name") as? String)?.takeIf { it.isNotBlank() }
                        ?: (embeddedClient?.get("fullName") as? String)?.takeIf { it.isNotBlank() }
                        ?: doc.getString("temporaryClient")?.takeIf { it.isNotBlank() }
                        ?: "Cliente - $street"

                    clientMap[clientId] = ClientOption(
                        id = clientId,
                        name = clientName,
                        document = null
                    )
                    addressMap[addrId] = AddressOption(
                        id = addrId,
                        clientId = clientId,
                        street = street,
                        city = city
                    )
                }
            } catch (e: Exception) {
                Log.w(TAG, "Fallback direto Firestore para locais agendados falhou: ${e.message}")
            }
        }

        Pair(
            clientMap.values.sortedBy { it.name },
            addressMap.values.sortedBy { it.street }
        )
    }

    suspend fun getAvailableClientsAndAddresses(): Pair<List<ClientOption>, List<AddressOption>> {
        val clientMap = mutableMapOf<String, ClientOption>()
        val addressMap = mutableMapOf<String, AddressOption>()

        val localOrders = orderDao.getAllOrders()
        for (o in localOrders) {
            val effectiveAddressId = o.addressId.trim()
            val effectiveStreet = o.addressStreet.trim()
            if (effectiveAddressId.isBlank() || effectiveStreet.isBlank() || effectiveStreet == "Endereço do Chamado") {
                continue
            }
            val effectiveClientId = o.clientId.trim().ifBlank { "CLI_$effectiveAddressId" }
            val effectiveClientName = o.clientName.trim().takeIf {
                it.isNotBlank() && it != "Cliente LeFrio" && it != "Cliente PMOC"
            } ?: "Cliente - $effectiveStreet"

            clientMap[effectiveClientId] = ClientOption(
                id = effectiveClientId,
                name = effectiveClientName,
                document = o.clientSigneeDoc
            )
            addressMap[effectiveAddressId] = AddressOption(
                id = effectiveAddressId,
                clientId = effectiveClientId,
                street = effectiveStreet,
                city = o.addressCity
            )
        }

        return Pair(
            clientMap.values.sortedBy { it.name },
            addressMap.values.sortedBy { it.street }
        )
    }

    suspend fun getEquipmentsForAddress(addressId: String): List<EquipmentOption> = withContext(Dispatchers.IO) {
        val cleanAid = addressId.trim()
        if (cleanAid.isBlank()) return@withContext emptyList()

        val resultList = mutableListOf<EquipmentOption>()
        val seenIds = mutableSetOf<String>()

        // 1. Verifica cache em memória primeiro (alimentado na sincronização do roteiro de hoje)
        cachedEquipmentsByAddress[cleanAid]?.let { cached ->
            for (eq in cached) {
                if (seenIds.add(eq.id)) {
                    resultList.add(eq)
                }
            }
        }

        // 2. PRIORIDADE OFFLINE-FIRST: Busca imediatamente no banco Room local (instantâneo e sem depender de internet)
        if (resultList.isEmpty()) {
            try {
                val localEquips = checklistDao.getDistinctEquipmentsForAddress(cleanAid)
                for (le in localEquips) {
                    if (seenIds.add(le.id)) {
                        val opt = EquipmentOption(
                            id = le.id,
                            addressId = cleanAid,
                            name = le.name,
                            brand = le.brand,
                            sector = le.sector,
                            btu = le.btu
                        )
                        resultList.add(opt)
                        cachedEquipmentsByAddress.getOrPut(cleanAid) { mutableListOf() }.add(opt)
                    }
                }
            } catch (e: Exception) {
                Log.d(TAG, "Busca local Room de equipamentos falhou: ${e.message}")
            }
        }

        // 3. Apenas se ainda estiver vazio E houver internet validada, consulta API/Firestore com timeout curto
        if (resultList.isEmpty() && NetworkMonitor.hasValidatedInternet(context)) {
            val apiEndpoints = listOf(
                "${FirebaseConfig.SHARED_API_BASE}/api/equipments?addressId=${java.net.URLEncoder.encode(cleanAid, "UTF-8")}",
                "http://10.0.2.2:3000/api/equipments?addressId=${java.net.URLEncoder.encode(cleanAid, "UTF-8")}"
            )
            for (endpoint in apiEndpoints) {
                try {
                    val url = java.net.URL(endpoint)
                    val conn = url.openConnection() as java.net.HttpURLConnection
                    conn.connectTimeout = 3000
                    conn.readTimeout = 4000
                    conn.requestMethod = "GET"
                    conn.setRequestProperty("Accept", "application/json")
                    if (conn.responseCode == 200) {
                        val responseStr = conn.inputStream.bufferedReader().use { it.readText() }
                        val json = JSONObject(responseStr)
                        if (json.optBoolean("success", false)) {
                            val arr = json.optJSONArray("equipments") ?: org.json.JSONArray()
                            for (i in 0 until arr.length()) {
                                val item = arr.getJSONObject(i)
                                val eqId = item.optString("id", "")
                                if (eqId.isNotBlank() && seenIds.add(eqId)) {
                                    val opt = EquipmentOption(
                                        id = eqId,
                                        addressId = cleanAid,
                                        name = item.optString("name", item.optString("label", "Equipamento")),
                                        brand = item.optString("brand", null).takeIf { !it.isNullOrBlank() },
                                        sector = item.optString("sector", null).takeIf { !it.isNullOrBlank() },
                                        btu = item.optString("btus", null).takeIf { !it.isNullOrBlank() }
                                    )
                                    resultList.add(opt)
                                    cachedEquipmentsByAddress.getOrPut(cleanAid) { mutableListOf() }.add(opt)
                                }
                            }
                            if (resultList.isNotEmpty()) break
                        }
                    }
                } catch (e: Exception) {
                    Log.d(TAG, "Tentativa de busca de equipamentos via API falhou: ${e.message}")
                }
            }
        }

        // 4. Última tentativa online: busca remota direta no Firestore com timeout
        if (resultList.isEmpty() && NetworkMonitor.hasValidatedInternet(context)) {
            try {
                val firestore = FirebaseConfig.getFirestore()
                val snap = withTimeout(6_000L) {
                    firestore.collection("equipments")
                        .whereEqualTo("addressId", cleanAid)
                        .limit(40)
                        .get(Source.SERVER)
                        .await()
                }
                for (doc in snap.documents) {
                    val docId = doc.id
                    if (seenIds.add(docId)) {
                        val name = doc.getString("name") ?: doc.getString("label") ?: "Equipamento"
                        val opt = EquipmentOption(
                            id = docId,
                            addressId = cleanAid,
                            name = name,
                            brand = doc.getString("brand"),
                            sector = doc.getString("sector"),
                            btu = doc.getString("btus")
                        )
                        resultList.add(opt)
                        cachedEquipmentsByAddress.getOrPut(cleanAid) { mutableListOf() }.add(opt)
                    }
                }
            } catch (e: Exception) {
                Log.d(TAG, "Busca remota Firestore de equipamentos indisponível: ${e.message}")
            }
        }

        resultList.sortedBy { it.name }
    }

    suspend fun getAllTechnicians(): List<com.lefrio.atendimento.data.local.entity.TechnicianEntity> {
        return db.technicianDao().getActiveTechniciansSync()
    }

    fun getServiceOrdersForTechnicianAndDate(
        technicianName: String,
        technicianId: String,
        date: String
    ): Flow<List<ServiceOrderEntity>> {
        return orderDao.getServiceOrdersForTechnicianAndDateFlow(technicianName, technicianId, date)
    }
}

data class CreateServiceOrderParams(
    val plannedDate: String,
    val type: String = "MANUTENÇÃO CORRETIVA CONTRATO",
    val clientId: String,
    val clientName: String,
    val addressId: String,
    val addressStreet: String,
    val equipmentId: String? = null,
    val equipmentName: String? = null,
    val equipmentBrand: String? = null,
    val equipmentBtus: String? = null,
    val equipmentSector: String? = null,
    val technicianId: String,
    val technicianName: String,
    val technician2Name: String? = null,
    val description: String,
    val diagnosis: String? = null,
    val solution: String? = null,
    val technicalReport: String? = null,
    val fiscalName: String? = null,
    val fiscalRegistration: String? = null,
    val fiscalRole: String? = null,
    val fiscalContact: String? = null,
    val signaturePath: String? = null,
    val signatureBase64: String? = null,
    val isFinalized: Boolean = false
)

data class ClientOption(
    val id: String,
    val name: String,
    val document: String? = null
)

data class AddressOption(
    val id: String,
    val clientId: String,
    val street: String,
    val city: String? = null
)

data class EquipmentOption(
    val id: String,
    val addressId: String,
    val name: String,
    val brand: String? = null,
    val sector: String? = null,
    val btu: String? = null
)
