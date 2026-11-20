package com.lefrio.atendimento.data.repository

import android.content.Context
import android.util.Log
import com.google.firebase.firestore.FirebaseFirestore
import com.lefrio.atendimento.data.FirebaseConfig
import com.lefrio.atendimento.data.local.AppDatabase
import com.lefrio.atendimento.data.local.entity.EquipmentChecklistEntity
import com.lefrio.atendimento.data.local.entity.RouteExpenseEntity
import com.lefrio.atendimento.data.local.entity.ServiceOrderEntity
import com.lefrio.atendimento.data.local.entity.SyncQueueEntity
import com.lefrio.atendimento.data.local.entity.TechNotificationEntity
import com.lefrio.atendimento.data.sync.SyncWorker
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.async
import kotlinx.coroutines.awaitAll
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.tasks.await
import kotlinx.coroutines.withContext
import org.json.JSONArray
import org.json.JSONObject
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import java.util.UUID

/**
 * Repositório Central de Ordens de Serviço e Atendimentos de Roteiro (Preventivas & Corretivas).
 * Todas as operações gravam primeiro localmente no Room (Offline-First) e sincronizam com o Firestore.
 */
class ServiceOrderRepository(private val context: Context) {

    companion object {
        // Cache em memória de máquinas por endereço alimentado na sincronização do roteiro
        private val cachedEquipmentsByAddress = java.util.concurrent.ConcurrentHashMap<String, MutableList<EquipmentOption>>()
    }

    private val db = AppDatabase.getInstance(context)
    private val orderDao = db.serviceOrderDao()
    private val checklistDao = db.equipmentChecklistDao()
    private val syncDao = db.syncQueueDao()
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

    fun getAllOrders(): Flow<List<ServiceOrderEntity>> = orderDao.getAllOrdersFlow()

    fun getAllOrdersProgress(): Flow<List<com.lefrio.atendimento.data.local.dao.OrderChecklistProgress>> =
        checklistDao.getAllOrdersProgressFlow()

    fun getOrderById(orderId: String): Flow<ServiceOrderEntity?> = orderDao.getOrderByIdFlow(orderId)

    fun getChecklistForOrder(orderId: String): Flow<List<EquipmentChecklistEntity>> =
        checklistDao.getChecklistForOrderFlow(orderId)

    /**
     * Sincroniza o Roteiro do Dia do Técnico (Manutenções Preventivas e Ordens de Serviço).
     * 1. Consulta diretamente o Firestore com queries paralelas filtradas pelo técnico e data, com fallback para a API HTTP.
     * 2. Associa endereços reais, clientes reais e o parque de máquinas reais cadastradas para o técnico.
     */
    suspend fun syncDailyItinerary(
        technicianName: String,
        technicianId: String,
        targetDate: String = SimpleDateFormat("yyyy-MM-dd", Locale.getDefault()).format(Date())
    ) = withContext(Dispatchers.IO) {
        // 0. Remove limpa e definitivamente qualquer registro de teste/seed antigo ou inválido do aparelho
        orderDao.deleteInvalidAndFakeOrders()
        orderDao.deleteFakeSeedOrders()
        checklistDao.deleteFakeSeedChecklists()

        val ordersToSave = mutableListOf<ServiceOrderEntity>()
        val checklistToSave = mutableListOf<EquipmentChecklistEntity>()
        val currentMonth = if (targetDate.length >= 7) targetDate.substring(0, 7) else "2026-11"

        val normTechName = technicianName.trim().uppercase()
        val normTechId = technicianId.trim().uppercase()

        // Tenta enviar pendências locais antes de reconciliar com o servidor
        try {
            com.lefrio.atendimento.data.sync.FirebaseSyncManager(context).processPendingSyncQueue()
        } catch (_: Exception) {}

        var fetchSuccess = false
        var serverQuerySucceeded = false

        // 1. TENTATIVA DIRETA E RESILIENTE NO FIRESTORE (Fonte primária de dados do aplicativo)
        try {
            FirebaseConfig.ensureAuthenticated()
            val firestore = FirebaseConfig.getFirestore()

            // A) Busca Manutenções Preventivas (maintenanceRecords) com queries direcionadas e paralelas
            val candidateDocsMap = LinkedHashMap<String, com.google.firebase.firestore.DocumentSnapshot>()
            val querySuccessCount = java.util.concurrent.atomic.AtomicInteger(0)
            try {
                coroutineScope {
                    val qDate = async {
                        try {
                            val docs = firestore.collection("maintenanceRecords")
                                .whereEqualTo("plannedDate", targetDate)
                                .get().await().documents
                            querySuccessCount.incrementAndGet()
                            docs
                        } catch (_: Exception) { emptyList() }
                    }
                    val qTech1 = async {
                        try {
                            if (normTechName.isNotBlank()) {
                                val docs = firestore.collection("maintenanceRecords")
                                    .whereEqualTo("technician1", normTechName)
                                    .get().await().documents
                                querySuccessCount.incrementAndGet()
                                docs
                            } else emptyList()
                        } catch (_: Exception) { emptyList() }
                    }
                    val qTech2 = async {
                        try {
                            if (normTechName.isNotBlank()) {
                                val docs = firestore.collection("maintenanceRecords")
                                    .whereEqualTo("technician2", normTechName)
                                    .get().await().documents
                                querySuccessCount.incrementAndGet()
                                docs
                            } else emptyList()
                        } catch (_: Exception) { emptyList() }
                    }

                    for (list in listOf(qDate.await(), qTech1.await(), qTech2.await())) {
                        for (d in list) {
                            candidateDocsMap[d.id] = d
                        }
                    }
                }

                // Fallback para busca por mês caso o nome do técnico tenha variação de grafia/acento
                if (candidateDocsMap.isEmpty()) {
                    val monthSnap = firestore.collection("maintenanceRecords")
                        .whereEqualTo("month", currentMonth)
                        .get().await()
                    querySuccessCount.incrementAndGet()
                    for (d in monthSnap.documents) {
                        candidateDocsMap[d.id] = d
                    }
                }
            } catch (e: Exception) {
                Log.w(TAG, "Falha ao buscar maintenanceRecords: ${e.message}")
            }

            if (querySuccessCount.get() > 0) {
                serverQuerySucceeded = true
                fetchSuccess = true
            }

            // Filtra os documentos do técnico que possuem data agendada (plannedDate não vazio) no mês atual ou rota recente
            val techScheduledDocs = candidateDocsMap.values.filter { doc ->
                val pDate = (doc.getString("plannedDate") ?: "").trim().take(10)
                val month = (doc.getString("month") ?: "").trim()
                val t1 = (doc.getString("technician1") ?: "").trim().uppercase()
                val t2 = (doc.getString("technician2") ?: "").trim().uppercase()

                val isMyTech = matchesTechResilient(t1, normTechName, normTechId) ||
                               matchesTechResilient(t2, normTechName, normTechId)

                val isRelevantMonth = pDate.startsWith(currentMonth) || month == currentMonth || pDate == targetDate
                isMyTech && pDate.isNotBlank() && isRelevantMonth
            }

            // Determina as datas ativas do roteiro do técnico (alinhado com a regra do PWA)
            val allTechDatesDesc = techScheduledDocs
                .mapNotNull { (it.getString("plannedDate") ?: "").trim().take(10).takeIf { d -> d.isNotBlank() } }
                .distinct()
                .sortedDescending()

            val activeRouteDates = mutableSetOf<String>()
            if (allTechDatesDesc.contains(targetDate)) {
                activeRouteDates.add(targetDate)
                allTechDatesDesc.firstOrNull { it < targetDate }?.let { activeRouteDates.add(it) }
            } else if (allTechDatesDesc.isNotEmpty()) {
                val pastOrToday = allTechDatesDesc.filter { it <= targetDate }
                val futureDates = allTechDatesDesc.reversed().filter { it > targetDate }
                val effectiveDate = pastOrToday.firstOrNull() ?: futureDates.firstOrNull() ?: targetDate
                activeRouteDates.add(effectiveDate)
                if (pastOrToday.size > 1) activeRouteDates.add(pastOrToday[1])
                if (futureDates.isNotEmpty()) activeRouteDates.add(futureDates[0])
            } else {
                activeRouteDates.add(targetDate)
            }

            val matchedDocs = techScheduledDocs.filter { doc ->
                val pDate = (doc.getString("plannedDate") ?: "").trim().take(10)
                pDate in activeRouteDates
            }
            val matchedAddressIds = matchedDocs.mapNotNull { it.getString("addressId")?.trim()?.takeIf { id -> id.isNotBlank() } }.toSet()

            Log.d(TAG, "Preventivas da rota ativa para $normTechName (${activeRouteDates.joinToString()}): ${matchedDocs.size}")

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

            // Busca equipamentos reais para os endereços encontrados em PARALELO
            val equipmentsMap = java.util.concurrent.ConcurrentHashMap<String, MutableList<com.google.firebase.firestore.DocumentSnapshot>>()
            coroutineScope {
                matchedAddressIds.map { aid ->
                    async {
                        val cleanAid = aid.trim()
                        if (cleanAid.isNotBlank()) {
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
                        generalNotes = "Manutenção Preventiva Periódica PMOC - Higienização, Testes e Revisão",
                        isLockedForEdit = status == "finalizada",
                        isSyncedWithServer = true
                    )
                )

                // Extrai checklist salvo no servidor para refletir máquinas já atendidas ou zeradas pelo administrativo
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
                if (realEquips.isNotEmpty()) {
                    for (eqDoc in realEquips) {
                        val eqName = eqDoc.getString("name") ?: eqDoc.getString("label") ?: "Ar Condicionado Split"
                        val srvItem = serverChecklistByEqId[eqDoc.id] ?: serverChecklistByName[eqName.trim().uppercase()]
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
                                isChecked = (srvItem?.get("checked") as? Boolean) ?: false,
                                isSkipped = (srvItem?.get("skipped") as? Boolean) ?: false,
                                notes = (srvItem?.get("notes") as? String) ?: "",
                                justification = (srvItem?.get("justification") as? String)?.takeIf { it.isNotBlank() },
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

            // B) Busca Ordens de Serviço Corretivas reais na coleção 'serviceOrders' (apenas ordens abertas para execução em campo)
            try {
                val ordersSnap = firestore.collection("serviceOrders")
                    .whereEqualTo("status", "aberta")
                    .get().await()
                for (doc in ordersSnap.documents) {
                    val tId = (doc.getString("technicianId") ?: "").trim().uppercase()
                    val tName = (doc.getString("technicianName") ?: doc.getString("technician1") ?: "").trim().uppercase()
                    val t2Id = (doc.getString("technician2Id") ?: "").trim().uppercase()
                    val t2Name = (doc.getString("technician2") ?: "").trim().uppercase()
                    val pDate = (doc.getString("plannedDate") ?: (doc.getString("openedAt")?.take(10) ?: "")).trim()
                    val status = doc.getString("status") ?: "aberta"

                    val matchesTech = matchesTechResilient(tId, normTechName, normTechId) ||
                                      matchesTechResilient(tName, normTechName, normTechId) ||
                                      matchesTechResilient(t2Id, normTechName, normTechId) ||
                                      matchesTechResilient(t2Name, normTechName, normTechId)

                    val matchesDate = pDate.startsWith(targetDate) || pDate.startsWith(currentMonth)

                    if (matchesTech && matchesDate && status != "cancelada") {
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
                                    plannedDate = doc.getString("plannedDate") ?: targetDate,
                                    status = status,
                                    type = doc.getString("type") ?: "MANUTENÇÃO CORRETIVA CONTRATO",
                                    technician1 = technicianName,
                                    technician2 = doc.getString("technician2"),
                                    generalNotes = doc.getString("description") ?: "Atendimento Corretivo Solicitado",
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

                            for (i in 0 until recordsArr.length()) {
                                val rec = recordsArr.getJSONObject(i)
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
                                        generalNotes = "Manutenção Preventiva Periódica PMOC - Higienização, Testes e Revisão",
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
                                                isChecked = srvItem?.optBoolean("checked", false) ?: false,
                                                isSkipped = srvItem?.optBoolean("skipped", false) ?: false,
                                                notes = srvItem?.optString("notes", "") ?: "",
                                                justification = srvItem?.optString("justification", "")?.takeIf { it.isNotBlank() },
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

                                ordersToSave.add(
                                    ServiceOrderEntity(
                                        id = osId,
                                        osNumber = os.optString("orderNumber", os.optString("osNumber", "OS-${osId.takeLast(4)}")),
                                        originalId = osId,
                                        clientId = clientId,
                                        clientName = resolvedClientName,
                                        addressId = addrId,
                                        addressStreet = resolvedStreet,
                                        plannedDate = os.optString("plannedDate", targetDate),
                                        status = os.optString("status", "aberta"),
                                        type = os.optString("type", "ORDEM DE SERVIÇO"),
                                        technician1 = technicianName,
                                        technician2 = os.optString("technician2", null),
                                        generalNotes = os.optString("description", "Atendimento Corretivo Solicitado"),
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
        //    - Preserva 100% de trabalhos offline ainda não enviados na fila de sincronização
        val pendingTasks = syncDao.getPendingTasks()
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
                    val isPreventive = localOrder.id.startsWith("PREV_") || localOrder.type.contains("PREVENTIVA", ignoreCase = true)
                    val hasPendingSync = localOrder.id in pendingOrderIds || !localOrder.isSyncedWithServer
                    if (isPreventive || !hasPendingSync) {
                        Log.d(TAG, "Removendo agendamento excluído/desvinculado no servidor: ${localOrder.id} (${localOrder.clientName})")
                        checklistDao.deleteChecklistsForOrder(localOrder.id)
                        orderDao.deleteOrderById(localOrder.id)
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

        return@withContext ordersToSave.size
    }

    /**
     * Atualiza o status do atendimento (ex: iniciar atendimento 'em_andamento').
     */
    suspend fun updateOrderStatus(orderId: String, newStatus: String) {
        orderDao.updateStatus(orderId, newStatus)

        val payload = JSONObject().apply {
            put("status", newStatus)
        }

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
        val currentOrder = orderDao.getOrderById(orderId)
        if (currentOrder != null && currentOrder.status == "aberta" && (isChecked || isSkipped)) {
            orderDao.updateStatus(orderId, "em_andamento")
        }

        val payload = JSONObject().apply {
            put("orderId", orderId)
            put("equipmentId", equipmentId)
            put("isChecked", isChecked)
            put("isSkipped", isSkipped)
            put("notes", notes)
            put("justification", justification ?: "")
            put("checkedAt", checkedAt ?: "")
        }

        syncDao.enqueue(
            SyncQueueEntity(
                entityType = "CHECKLIST_ITEM",
                referenceId = existing?.id ?: checklistId,
                actionType = "UPDATE",
                payloadJson = payload.toString()
            )
        )

        SyncWorker.triggerImmediateSync(context)
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
        signatureDate: String,
        signatureFilePath: String,
        completionDate: String,
        latitude: Double,
        longitude: Double,
        accuracy: Float,
        signatureBase64: String? = null,
        checklistItems: List<EquipmentChecklistEntity>? = null
    ) = withContext(Dispatchers.IO) {
        val existingOrder = orderDao.getOrderById(orderId)
        val isPreventive = existingOrder?.type?.contains("PREVENTIVA", ignoreCase = true) == true || orderId.startsWith("PREV_")
        val originalRecordId = existingOrder?.originalId ?: orderId.removePrefix("PREV_")
        val addressId = existingOrder?.addressId ?: ""
        val plannedDate = existingOrder?.plannedDate ?: ""
        val month = if (plannedDate.length >= 7) plannedDate.substring(0, 7) else SimpleDateFormat("yyyy-MM", Locale.getDefault()).format(Date())

        val effectiveChecklist = if (!checklistItems.isNullOrEmpty()) {
            checklistItems
        } else {
            checklistDao.getChecklistForOrder(orderId)
        }

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
            val obj = JSONObject().apply {
                put("equipmentId", item.equipmentId)
                put("checked", item.isChecked)
                put("skipped", item.isSkipped)
                put("justification", item.justification ?: "")
                put("notes", item.notes ?: "")
                put("checkedAt", item.checkedAt ?: completionDate)
            }
            checklistArr.put(obj)
        }

        val executedQty = effectiveChecklist.count { it.isChecked && !it.isSkipped }

        val payload = JSONObject().apply {
            put("clientRepresentative", signeeName)
            put("clientSigneeName", signeeName)
            put("clientSigneeDoc", signeeDoc)
            put("clientSigneeRegistration", signeeDoc)
            put("clientSignatureDate", signatureDate)
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
            put("checklist", checklistArr)
            if (!signatureBase64.isNullOrBlank()) {
                put("clientSignature", signatureBase64)
            }
        }

        syncDao.enqueue(
            SyncQueueEntity(
                entityType = "FINALIZE_SERVICE",
                referenceId = orderId,
                actionType = "FINALIZE",
                payloadJson = payload.toString()
            )
        )

        // ENVIO IMEDIATO: Se houver conexão estável, envia na hora para o Firestore (aprovação + notificação)
        try {
            com.lefrio.atendimento.data.sync.FirebaseSyncManager(context).processPendingSyncQueue()
        } catch (e: Exception) {
            Log.w(TAG, "Envio imediato indisponível (será reenviado automaticamente via SyncWorker): ${e.message}")
        }

        // Garantia offline-first caso o aparelho esteja sem rede no momento
        SyncWorker.triggerImmediateSync(context)
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

        val nowIso = SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss", Locale.getDefault()).format(Date())
        val hasSignature = !params.signaturePath.isNullOrBlank() || !params.signatureBase64.isNullOrBlank()
        val isFinal = params.isFinalized || hasSignature
        val status = if (isFinal) "finalizada" else "aberta"
        val completionDate = if (isFinal) nowIso else null

        val fullNotes = buildString {
            append("MOTIVO / DESCRIÇÃO: ${params.description.ifBlank { "Atendimento técnico no local" }}")
            if (!params.diagnosis.isNullOrBlank()) {
                append("\nDIAGNÓSTICO DA MÁQUINA: ${params.diagnosis}")
            }
            if (!params.solution.isNullOrBlank()) {
                append("\nSOLUÇÃO APLICADA: ${params.solution}")
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

        // 2. Se informou equipamento, cria item no checklist inicial
        if (!params.equipmentId.isNullOrBlank()) {
            val checkId = "CHK_${orderId}_${params.equipmentId}"
            val checkItem = EquipmentChecklistEntity(
                id = checkId,
                orderId = orderId,
                equipmentId = params.equipmentId,
                equipmentName = params.equipmentName ?: "Equipamento Climatização",
                equipmentBrand = "Principal",
                equipmentBtus = "",
                equipmentSector = "Geral",
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
            put("status", status)
            put("type", params.type)
            put("plannedDate", params.plannedDate)
            put("technicianId", params.technicianId)
            put("technician1", params.technicianName)
            put("technician2", params.technician2Name ?: "")
            put("description", params.description)
            put("diagnosis", params.diagnosis ?: "")
            put("solution", params.solution ?: "")
            put("clientRepresentative", params.fiscalName ?: "")
            put("clientSigneeName", params.fiscalName ?: "")
            put("clientSigneeRegistration", params.fiscalRegistration ?: "")
            put("clientSigneeDoc", params.fiscalRegistration ?: "")
            put("clientSignaturePath", params.signaturePath ?: "")
            put("clientSignatureDate", if (isFinal) nowIso else "")
            put("completionDate", completionDate ?: "")
            put("finishedAt", if (isFinal) nowIso else "")
            put("techFinalizedAt", if (isFinal) nowIso else "")
            put("techFinalized", isFinal)
            put("clientSignature", params.signatureBase64 ?: "")
            put("generalNotes", fullNotes)
            put("openedAt", nowIso)
        }

        syncDao.enqueue(
            SyncQueueEntity(
                entityType = "CREATE_SERVICE_ORDER",
                referenceId = orderId,
                actionType = "CREATE",
                payloadJson = payload.toString()
            )
        )

        // ENVIO IMEDIATO: Se houver internet, grava na hora no Firestore e notifica o administrativo
        try {
            com.lefrio.atendimento.data.sync.FirebaseSyncManager(context).processPendingSyncQueue()
        } catch (e: Exception) {
            Log.w(TAG, "Envio imediato da O.S. indisponível (será reenviado via SyncWorker): ${e.message}")
        }

        // Dispara sincronização em segundo plano como garantia offline
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
        // busca diretamente no Firestore os agendamentos do técnico
        if (addressMap.isEmpty()) {
            try {
                FirebaseConfig.ensureAuthenticated()
                val firestore = FirebaseConfig.getFirestore()
                val normTechName = technicianName.trim().uppercase()
                val currentMonth = if (date.length >= 7) date.substring(0, 7) else "2026-11"

                val docs = mutableListOf<com.google.firebase.firestore.DocumentSnapshot>()
                if (normTechName.isNotBlank()) {
                    val s1 = firestore.collection("maintenanceRecords")
                        .whereEqualTo("technician1", normTechName)
                        .get().await()
                    val s2 = firestore.collection("maintenanceRecords")
                        .whereEqualTo("technician2", normTechName)
                        .get().await()
                    docs.addAll(s1.documents)
                    docs.addAll(s2.documents)
                }

                for (doc in docs) {
                    val pDate = (doc.getString("plannedDate") ?: "").trim()
                    val month = (doc.getString("month") ?: "").trim()
                    if (pDate.isBlank() || (!pDate.startsWith(currentMonth) && month != currentMonth && !pDate.startsWith(date))) {
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

        // 2. Tenta buscar na API HTTP rápida do sistema (/api/equipments?addressId=...)
        if (resultList.isEmpty()) {
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

        // 3. Tenta buscar no banco Room local (offline-first dos checklists gravados das ordens deste endereço)
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

        // 4. Última tentativa: busca remota direta no Firestore
        if (resultList.isEmpty()) {
            try {
                val firestore = FirebaseConfig.getFirestore()
                val snap = firestore.collection("equipments")
                    .whereEqualTo("addressId", cleanAid)
                    .limit(40)
                    .get()
                    .await()
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
    val technicianId: String,
    val technicianName: String,
    val technician2Name: String? = null,
    val description: String,
    val diagnosis: String? = null,
    val solution: String? = null,
    val fiscalName: String? = null,
    val fiscalRegistration: String? = null,
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
