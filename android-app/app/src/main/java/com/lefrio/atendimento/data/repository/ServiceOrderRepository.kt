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
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.tasks.await
import kotlinx.coroutines.withContext
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

    fun getAllOrders(): Flow<List<ServiceOrderEntity>> = orderDao.getAllOrdersFlow()

    fun getAllOrdersProgress(): Flow<List<com.lefrio.atendimento.data.local.dao.OrderChecklistProgress>> =
        checklistDao.getAllOrdersProgressFlow()

    fun getOrderById(orderId: String): Flow<ServiceOrderEntity?> = orderDao.getOrderByIdFlow(orderId)

    fun getChecklistForOrder(orderId: String): Flow<List<EquipmentChecklistEntity>> =
        checklistDao.getChecklistForOrderFlow(orderId)

    /**
     * Sincroniza o Roteiro do Dia do Técnico (Manutenções Preventivas e Ordens de Serviço).
     * 1. Consulta a API inteligente do sistema (/api/tech-demand/itinerary) com fallback direto no Firestore.
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
        val currentMonth = if (targetDate.length >= 7) targetDate.substring(0, targetDate.lastIndexOf('-').let { if (it > 0) it else 7 }) else "2026-10"

        val normTechName = technicianName.trim().uppercase()
        val normTechId = technicianId.trim().uppercase()

        var fetchSuccess = false

        // 1. TENTATIVA 1: API HTTP Rápida do Sistema (/api/tech-demand/itinerary)
        val apiEndpoints = listOf(
            "${FirebaseConfig.SHARED_API_BASE}/api/tech-demand/itinerary?tech=${java.net.URLEncoder.encode(normTechName, "UTF-8")}&month=$currentMonth&date=$targetDate",
            "http://10.0.2.2:3000/api/tech-demand/itinerary?tech=${java.net.URLEncoder.encode(normTechName, "UTF-8")}&month=$currentMonth&date=$targetDate"
        )

        for (endpoint in apiEndpoints) {
            if (fetchSuccess) break
            try {
                val url = java.net.URL(endpoint)
                val conn = url.openConnection() as java.net.HttpURLConnection
                conn.connectTimeout = 4000
                conn.readTimeout = 5000
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

                        // Mapeia endereços por ID
                        val addrsMap = mutableMapOf<String, JSONObject>()
                        for (i in 0 until addrsArr.length()) {
                            val a = addrsArr.getJSONObject(i)
                            val aid = a.optString("id", "")
                            if (aid.isNotBlank()) addrsMap[aid] = a
                        }

                        // Mapeia clientes por ID
                        val clientsMap = mutableMapOf<String, JSONObject>()
                        for (i in 0 until clientsArr.length()) {
                            val c = clientsArr.getJSONObject(i)
                            val cid = c.optString("id", "")
                            if (cid.isNotBlank()) clientsMap[cid] = c
                        }

                        // Mapeia equipamentos por addressId e alimenta cache de máquinas para ordens de serviço
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

                        // Processa manutenções preventivas (PMOC)
                        for (i in 0 until recordsArr.length()) {
                            val rec = recordsArr.getJSONObject(i)
                            val recId = rec.optString("id", UUID.randomUUID().toString())
                            val addrId = rec.optString("addressId", "")
                            val addrObj = addrsMap[addrId]
                            val clientId = addrObj?.optString("clientId", "") ?: rec.optString("clientId", "")
                            val clientObj = clientsMap[clientId]

                            val clientName = clientObj?.optString("name")
                                ?: rec.optString("clientName", "Cliente LeFrio PMOC")
                            val street = addrObj?.optString("street") ?: "Endereço Operacional"
                            val num = addrObj?.optString("number")?.let { ", $it" } ?: ""
                            val neigh = addrObj?.optString("neighborhood")?.let { " - $it" } ?: ""
                            val city = addrObj?.optString("city", "Maceió") ?: "Maceió"
                            val fullStreet = "$street$num$neigh"

                            val orderId = "PREV_${recId}"
                            val statusRaw = rec.optString("status", "aberta")
                            val status = when (statusRaw) {
                                "completed" -> "finalizada"
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
                                    generalNotes = "Manutenção Preventiva Periódica PMOC - Higienização, Testes e Revisão",
                                    isSyncedWithServer = true
                                )
                            )

                            // Equipamentos Reais deste Endereço
                            val addrEquips = equipsByAddr[addrId] ?: emptyList()
                            if (addrEquips.isNotEmpty()) {
                                for (eq in addrEquips) {
                                    val eqId = eq.optString("id", UUID.randomUUID().toString())
                                    checklistToSave.add(
                                        EquipmentChecklistEntity(
                                            id = "CHECK_${orderId}_${eqId}",
                                            orderId = orderId,
                                            equipmentId = eqId,
                                            equipmentName = eq.optString("name", "Ar Condicionado Split"),
                                            equipmentBrand = eq.optString("brand", null),
                                            equipmentBtus = eq.optString("btus", null),
                                            equipmentSector = eq.optString("sector", "Geral"),
                                            equipmentPatrimony = eq.optString("patrimony", null)
                                        )
                                    )
                                }
                            } else {
                                val totalMac = addrObj?.optInt("totalMachines", 4) ?: 4
                                val count = if (totalMac > 0) totalMac else 4
                                for (m in 1..count) {
                                    val eqId = "EQ_${recId}_$m"
                                    checklistToSave.add(
                                        EquipmentChecklistEntity(
                                            id = "CHECK_${orderId}_${eqId}",
                                            orderId = orderId,
                                            equipmentId = eqId,
                                            equipmentName = "Ar Condicionado Split #0$m",
                                            equipmentBrand = if (m % 2 == 0) "Carrier" else "Gree",
                                            equipmentBtus = if (m % 2 == 0) "12000 BTUs" else "18000 BTUs",
                                            equipmentSector = "Setor Operacional / Sala $m"
                                        )
                                    )
                                }
                            }
                        }

                        // Processa Ordens de Serviço Corretivas reais
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

                            // CRÍTICO: Se a O.S. não pertencer a nenhum cliente real cadastrado no sistema, descarta!
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

                        if (ordersToSave.isNotEmpty()) {
                            fetchSuccess = true
                            Log.d(TAG, "Sincronização via API concluída com sucesso: ${ordersToSave.size} ordens carregadas.")
                        }
                    }
                }
            } catch (e: Exception) {
                Log.w(TAG, "Tentativa de sincronização via API falhou para $endpoint: ${e.message}")
            }
        }

        // 2. TENTATIVA 2: Leitura Direta no Firestore com Enriquecimento
        if (!fetchSuccess) {
            try {
                val firestore = FirebaseConfig.getFirestore()

                // A) Busca Manutenções Preventivas (maintenanceRecords)
                val recordsSnap = firestore.collection("maintenanceRecords").get().await()
                val matchedDocs = mutableListOf<com.google.firebase.firestore.DocumentSnapshot>()
                val matchedAddressIds = mutableSetOf<String>()

                for (doc in recordsSnap.documents) {
                    val pDate = doc.getString("plannedDate") ?: ""
                    val month = doc.getString("month") ?: ""
                    val t1 = (doc.getString("technician1") ?: "").trim().uppercase()
                    val t2 = (doc.getString("technician2") ?: "").trim().uppercase()

                    val isSameMonthOrDate = pDate.startsWith(targetDate) || month == currentMonth || pDate.startsWith(currentMonth)
                    val isMyTech = (t1.isNotBlank() && (t1.contains(normTechName) || t1 == normTechId)) ||
                                   (t2.isNotBlank() && (t2.contains(normTechName) || t2 == normTechId))

                    if (isSameMonthOrDate && isMyTech) {
                        matchedDocs.add(doc)
                        doc.getString("addressId")?.let { if (it.isNotBlank()) matchedAddressIds.add(it) }
                    }
                }

                // Busca dados reais dos endereços
                val addressMap = mutableMapOf<String, com.google.firebase.firestore.DocumentSnapshot>()
                val clientIdsToFetch = mutableSetOf<String>()
                for (aid in matchedAddressIds) {
                    try {
                        val addrDoc = firestore.collection("addresses").document(aid).get().await()
                        if (addrDoc.exists()) {
                            addressMap[aid] = addrDoc
                            addrDoc.getString("clientId")?.let { if (it.isNotBlank()) clientIdsToFetch.add(it) }
                        }
                    } catch (ignored: Exception) {}
                }

                // Busca dados reais dos clientes
                val clientMap = mutableMapOf<String, String>()
                for (cid in clientIdsToFetch) {
                    try {
                        val clientDoc = firestore.collection("clients").document(cid).get().await()
                        if (clientDoc.exists()) {
                            clientDoc.getString("name")?.let { clientMap[cid] = it }
                        }
                    } catch (ignored: Exception) {}
                }

                // Busca equipamentos reais para os endereços encontrados e popula cache do aplicativo
                val equipmentsMap = mutableMapOf<String, MutableList<com.google.firebase.firestore.DocumentSnapshot>>()
                for (aid in matchedAddressIds) {
                    val cleanAid = aid.trim()
                    if (cleanAid.isBlank()) continue
                    try {
                        val eqSnap = firestore.collection("equipments").whereEqualTo("addressId", cleanAid).get().await()
                        for (eqDoc in eqSnap.documents) {
                            val isActive = eqDoc.getBoolean("active") ?: true
                            if (isActive && eqDoc.getString("status") != "deactivated") {
                                equipmentsMap.getOrPut(cleanAid) { mutableListOf() }.add(eqDoc)
                                val eqName = eqDoc.getString("name") ?: eqDoc.getString("label") ?: "Ar Condicionado Split"
                                val opt = EquipmentOption(
                                    id = eqDoc.id,
                                    addressId = cleanAid,
                                    name = eqName,
                                    brand = eqDoc.getString("brand"),
                                    sector = eqDoc.getString("sector"),
                                    btu = eqDoc.getString("btus")
                                )
                                val existingList = cachedEquipmentsByAddress.getOrPut(cleanAid) { mutableListOf() }
                                if (existingList.none { it.id == opt.id }) {
                                    existingList.add(opt)
                                }
                            }
                        }
                    } catch (ignored: Exception) {}
                }

                for (doc in matchedDocs) {
                    val orderId = "PREV_${doc.id}"
                    val addrId = doc.getString("addressId") ?: ""
                    val addrDoc = addressMap[addrId]
                    val clientId = addrDoc?.getString("clientId") ?: doc.getString("clientId") ?: ""
                    val clientName = clientMap[clientId] ?: doc.getString("clientName") ?: "Cliente PMOC"

                    val street = addrDoc?.getString("street") ?: doc.getString("addressStreet") ?: "Endereço Operacional"
                    val num = addrDoc?.getString("number")?.let { ", $it" } ?: ""
                    val neigh = addrDoc?.getString("neighborhood")?.let { " - $it" } ?: ""
                    val city = addrDoc?.getString("city") ?: "Maceió"
                    val fullStreet = "$street$num$neigh"

                    val statusRaw = doc.getString("status") ?: "aberta"
                    val status = when (statusRaw) {
                        "completed" -> "finalizada"
                        "in_progress" -> "em_andamento"
                        else -> "aberta"
                    }

                    ordersToSave.add(
                        ServiceOrderEntity(
                            id = orderId,
                            osNumber = "PMOC-${doc.id.takeLast(4).uppercase()}",
                            originalId = doc.id,
                            clientId = clientId,
                            clientName = clientName,
                            addressId = addrId,
                            addressStreet = fullStreet,
                            addressCity = city,
                            plannedDate = doc.getString("plannedDate") ?: targetDate,
                            status = status,
                            type = "MANUTENÇÃO PREVENTIVA",
                            technician1 = technicianName,
                            technician2 = doc.getString("technician2"),
                            generalNotes = "Manutenção Preventiva Periódica PMOC - Higienização, Testes e Revisão",
                            isSyncedWithServer = true
                        )
                    )

                    val realEquips = equipmentsMap[addrId] ?: emptyList()
                    if (realEquips.isNotEmpty()) {
                        for (eqDoc in realEquips) {
                            checklistToSave.add(
                                EquipmentChecklistEntity(
                                    id = "CHECK_${orderId}_${eqDoc.id}",
                                    orderId = orderId,
                                    equipmentId = eqDoc.id,
                                    equipmentName = eqDoc.getString("name") ?: "Ar Condicionado Split",
                                    equipmentBrand = eqDoc.getString("brand"),
                                    equipmentBtus = eqDoc.getString("btus"),
                                    equipmentSector = eqDoc.getString("sector") ?: "Geral",
                                    equipmentPatrimony = eqDoc.getString("patrimony")
                                )
                            )
                        }
                    } else {
                        val totalMachines = addrDoc?.getLong("totalMachines")?.toInt() ?: 4
                        val count = if (totalMachines > 0) totalMachines else 4
                        for (m in 1..count) {
                            val eqId = "EQ_${doc.id}_$m"
                            checklistToSave.add(
                                EquipmentChecklistEntity(
                                    id = "CHECK_${orderId}_${eqId}",
                                    orderId = orderId,
                                    equipmentId = eqId,
                                    equipmentName = "Ar Condicionado Split #0$m",
                                    equipmentBrand = if (m % 2 == 0) "Carrier" else "Gree",
                                    equipmentBtus = if (m % 2 == 0) "12000 BTUs" else "18000 BTUs",
                                    equipmentSector = "Ambiente Administrativo / Sala $m"
                                )
                            )
                        }
                    }
                }

                // B) Busca Ordens de Serviço Reais na coleção oficial 'serviceOrders' no Firestore
                try {
                    val ordersSnap = firestore.collection("serviceOrders").get().await()
                    for (doc in ordersSnap.documents) {
                        val tId = (doc.getString("technicianId") ?: "").trim().uppercase()
                        val tName = (doc.getString("technicianName") ?: doc.getString("technician1") ?: "").trim().uppercase()
                        val t2Id = (doc.getString("technician2Id") ?: "").trim().uppercase()
                        val t2Name = (doc.getString("technician2") ?: "").trim().uppercase()
                        val pDate = (doc.getString("plannedDate") ?: (doc.getString("openedAt")?.take(10) ?: "")).trim()
                        val status = doc.getString("status") ?: "aberta"

                        val matchesTech = (tId.isNotBlank() && (tId == normTechId || tId.contains(normTechName))) ||
                                          (tName.isNotBlank() && (tName == normTechId || tName.contains(normTechName))) ||
                                          (t2Id.isNotBlank() && (t2Id == normTechId || t2Id.contains(normTechName))) ||
                                          (t2Name.isNotBlank() && (t2Name == normTechId || t2Name.contains(normTechName)))

                        val matchesDate = pDate.startsWith(targetDate)

                        if (matchesTech && matchesDate && status != "cancelada") {
                            val cId = doc.getString("clientId") ?: ""
                            val aId = doc.getString("addressId") ?: ""
                            val addrDoc = addressMap[aId]

                            val realClientName = clientMap[cId]
                                ?: doc.getString("clientName")?.takeIf { it.isNotBlank() && it != "Cliente LeFrio" && it != "Cliente PMOC" }

                            val realStreet = addrDoc?.let {
                                val s = it.getString("street") ?: ""
                                val num = it.getString("number")?.let { n -> ", $n" } ?: ""
                                val neigh = it.getString("neighborhood")?.let { nb -> " - $nb" } ?: ""
                                "$s$num$neigh".trim()
                            }?.takeIf { it.isNotBlank() } ?: doc.getString("addressStreet")?.takeIf { it.isNotBlank() && it != "Endereço do Chamado" }

                            // Não adiciona se a O.S. não pertencer a nenhum cliente real cadastrado no sistema
                            if (realClientName.isNullOrBlank() || realStreet.isNullOrBlank()) {
                                continue
                            }

                            if (ordersToSave.none { it.id == doc.id }) {
                                ordersToSave.add(
                                    ServiceOrderEntity(
                                        id = doc.id,
                                        osNumber = doc.getString("osNumber") ?: doc.getString("orderNumber") ?: "OS-${doc.id.takeLast(4)}",
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
                    Log.d(TAG, "Tentativa de leitura em serviceOrders: ${e.message}")
                }

                if (ordersToSave.isNotEmpty()) {
                    fetchSuccess = true
                }
            } catch (e: Exception) {
                Log.w(TAG, "Tentativa direta Firestore falhou: ${e.message}")
            }
        }

        // 3. Gravação resiliente no banco Room preservando 100% dos dados locais do técnico
        // Lemos com antecedência TODOS os checklists locais já gravados no aparelho
        val allLocalChecklists = checklistDao.getAllChecklists()
        val localById = allLocalChecklists.associateBy { it.id }
        val localByOrderAndEq = allLocalChecklists.associateBy { "${it.orderId}___${it.equipmentId}" }
        val localByOrderAndName = allLocalChecklists.associateBy { "${it.orderId}___${it.equipmentName.trim().uppercase()}" }

        // Primeiro: Atualiza/insere ordens de serviço preservando dados locais
        if (ordersToSave.isNotEmpty()) {
            for (i in ordersToSave.indices) {
                val incoming = ordersToSave[i]
                val existing = orderDao.getOrderById(incoming.id)
                if (existing != null) {
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
                        isSyncedWithServer = if (!existing.isSyncedWithServer) false else incoming.isSyncedWithServer
                    )
                }
            }
            orderDao.insertAll(ordersToSave)
        }

        // Segundo: Processa e preserva 100% dos checklists
        if (checklistToSave.isNotEmpty()) {
            val processedOrderIds = ordersToSave.map { it.id }.toSet()
            val finalChecklistMap = mutableMapOf<String, EquipmentChecklistEntity>()

            for (incoming in checklistToSave) {
                val existing = localById[incoming.id]
                    ?: localByOrderAndEq["${incoming.orderId}___${incoming.equipmentId}"]
                    ?: localByOrderAndName["${incoming.orderId}___${incoming.equipmentName.trim().uppercase()}"]

                if (existing != null) {
                    // PRESERVAÇÃO TOTAL: O status preenchido pelo técnico no celular é sagrado e tem precedência
                    val isChecked = existing.isChecked || incoming.isChecked
                    val isSkipped = existing.isSkipped || incoming.isSkipped
                    val notes = if (existing.notes.isNotBlank()) existing.notes else incoming.notes
                    val justification = existing.justification ?: incoming.justification
                    val checkedAt = existing.checkedAt ?: incoming.checkedAt
                    val localPhotoPaths = if (existing.localPhotoPathsJson != "[]") existing.localPhotoPathsJson else incoming.localPhotoPathsJson
                    val remotePhotoUrls = if (existing.remotePhotoUrlsJson != "[]") existing.remotePhotoUrlsJson else incoming.remotePhotoUrlsJson
                    val isSynced = if (!existing.isSynced) false else incoming.isSynced

                    val merged = incoming.copy(
                        id = existing.id,
                        equipmentId = existing.equipmentId,
                        isChecked = isChecked,
                        isSkipped = isSkipped,
                        notes = notes,
                        justification = justification,
                        checkedAt = checkedAt,
                        localPhotoPathsJson = localPhotoPaths,
                        remotePhotoUrlsJson = remotePhotoUrls,
                        isSynced = isSynced
                    )
                    finalChecklistMap[merged.id] = merged
                } else {
                    finalChecklistMap[incoming.id] = incoming
                }
            }

            // Não perde nenhum checklist local que já existia no celular para essas ordens
            for (localItem in allLocalChecklists) {
                if (localItem.orderId in processedOrderIds && !finalChecklistMap.containsKey(localItem.id)) {
                    finalChecklistMap[localItem.id] = localItem
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

    /**
     * Finaliza o atendimento com assinatura digital do cliente e auditoria GPS.
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
        accuracy: Float
    ) {
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

        val payload = JSONObject().apply {
            put("clientRepresentative", signeeName)
            put("clientSigneeDoc", signeeDoc)
            put("clientSignatureDate", signatureDate)
            put("completionDate", completionDate)
            put("completionLatitude", latitude)
            put("completionLongitude", longitude)
            put("completionAccuracy", accuracy.toDouble())
        }

        syncDao.enqueue(
            SyncQueueEntity(
                entityType = "FINALIZE_SERVICE",
                referenceId = orderId,
                actionType = "FINALIZE",
                payloadJson = payload.toString()
            )
        )

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

        // Dispara sincronização em segundo plano
        SyncWorker.triggerImmediateSync(context)

        return entity
    }

    suspend fun getScheduledClientsAndAddressesForTechnician(
        technicianName: String,
        technicianId: String,
        date: String
    ): Pair<List<ClientOption>, List<AddressOption>> {
        val scheduledList = orderDao.getScheduledLocationsForTechnicianAndDate(
            technicianName = technicianName,
            technicianId = technicianId,
            date = date
        )

        val clientMap = mutableMapOf<String, ClientOption>()
        val addressMap = mutableMapOf<String, AddressOption>()

        for (item in scheduledList) {
            if (item.clientId.isNotBlank() && item.clientName.isNotBlank() && item.clientName != "Cliente LeFrio" && item.clientName != "Cliente PMOC") {
                clientMap[item.clientId] = ClientOption(
                    id = item.clientId,
                    name = item.clientName,
                    document = item.clientDocument
                )
            }
            if (item.addressId.isNotBlank() && item.addressStreet.isNotBlank() && item.addressStreet != "Endereço do Chamado") {
                addressMap[item.addressId] = AddressOption(
                    id = item.addressId,
                    clientId = item.clientId,
                    street = item.addressStreet,
                    city = item.addressCity
                )
            }
        }

        return Pair(
            clientMap.values.sortedBy { it.name },
            addressMap.values.sortedBy { it.street }
        )
    }

    suspend fun getAvailableClientsAndAddresses(): Pair<List<ClientOption>, List<AddressOption>> {
        val clientMap = mutableMapOf<String, ClientOption>()
        val addressMap = mutableMapOf<String, AddressOption>()

        val localOrders = orderDao.getAllOrders()
        for (o in localOrders) {
            if (o.clientId.isNotBlank() && o.clientName.isNotBlank() && o.clientName != "Cliente LeFrio" && o.clientName != "Cliente PMOC") {
                clientMap[o.clientId] = ClientOption(
                    id = o.clientId,
                    name = o.clientName,
                    document = o.clientDocument
                )
            }
            if (o.addressId.isNotBlank() && o.addressStreet.isNotBlank() && o.addressStreet != "Endereço do Chamado") {
                addressMap[o.addressId] = AddressOption(
                    id = o.addressId,
                    clientId = o.clientId,
                    street = o.addressStreet,
                    city = o.addressCity
                )
            }
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
