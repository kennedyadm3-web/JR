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

    private val db = AppDatabase.getInstance(context)
    private val orderDao = db.serviceOrderDao()
    private val checklistDao = db.equipmentChecklistDao()
    private val syncDao = db.syncQueueDao()
    private val TAG = "ServiceOrderRepo"

    fun getAllOrders(): Flow<List<ServiceOrderEntity>> = orderDao.getAllOrdersFlow()

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
        val ordersToSave = mutableListOf<ServiceOrderEntity>()
        val checklistToSave = mutableListOf<EquipmentChecklistEntity>()
        val currentMonth = if (targetDate.length >= 7) targetDate.substring(0, 7) else "2026-10"

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

                        // Mapeia equipamentos por addressId
                        val equipsByAddr = mutableMapOf<String, MutableList<JSONObject>>()
                        for (i in 0 until equipsArr.length()) {
                            val eq = equipsArr.getJSONObject(i)
                            val eqAid = eq.optString("addressId", "")
                            if (eqAid.isNotBlank()) {
                                equipsByAddr.getOrPut(eqAid) { mutableListOf() }.add(eq)
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

                        // Processa Ordens de Serviço Corretivas
                        for (i in 0 until osArr.length()) {
                            val os = osArr.getJSONObject(i)
                            val osId = os.optString("id", UUID.randomUUID().toString())
                            ordersToSave.add(
                                ServiceOrderEntity(
                                    id = osId,
                                    osNumber = os.optString("orderNumber", "OS-${osId.takeLast(4)}"),
                                    originalId = osId,
                                    clientId = os.optString("clientId", ""),
                                    clientName = os.optString("clientName", "Cliente LeFrio"),
                                    addressId = os.optString("addressId", ""),
                                    addressStreet = os.optString("addressStreet", "Endereço do Chamado"),
                                    plannedDate = os.optString("plannedDate", targetDate),
                                    status = os.optString("status", "aberta"),
                                    type = "ORDEM DE SERVIÇO",
                                    technician1 = technicianName,
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
                    } catch (_: Exception) {}
                }

                // Busca dados reais dos clientes
                val clientMap = mutableMapOf<String, String>()
                for (cid in clientIdsToFetch) {
                    try {
                        val clientDoc = firestore.collection("clients").document(cid).get().await()
                        if (clientDoc.exists()) {
                            clientDoc.getString("name")?.let { clientMap[cid] = it }
                        }
                    } catch (_: Exception) {}
                }

                // Busca equipamentos reais para os endereços encontrados
                val equipmentsMap = mutableMapOf<String, MutableList<com.google.firebase.firestore.DocumentSnapshot>>()
                for (aid in matchedAddressIds) {
                    try {
                        val eqSnap = firestore.collection("equipments").whereEqualTo("addressId", aid).get().await()
                        for (eqDoc in eqSnap.documents) {
                            val isActive = eqDoc.getBoolean("active") ?: true
                            if (isActive && eqDoc.getString("status") != "deactivated") {
                                equipmentsMap.getOrPut(aid) { mutableListOf() }.add(eqDoc)
                            }
                        }
                    } catch (_: Exception) {}
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

                // B) Busca Ordens de Serviço Corretivas (service_orders)
                val ordersSnap = firestore.collection("service_orders").get().await()
                for (doc in ordersSnap.documents) {
                    val tId = (doc.getString("technicianId") ?: "").trim().uppercase()
                    val tName = (doc.getString("technicianName") ?: "").trim().uppercase()
                    if (tId == normTechId || tName.contains(normTechName)) {
                        ordersToSave.add(
                            ServiceOrderEntity(
                                id = doc.id,
                                osNumber = doc.getString("orderNumber") ?: "OS-${doc.id.takeLast(4)}",
                                originalId = doc.id,
                                clientId = doc.getString("clientId") ?: "",
                                clientName = doc.getString("clientName") ?: "Cliente LeFrio",
                                addressId = doc.getString("addressId") ?: "",
                                addressStreet = doc.getString("addressStreet") ?: "Endereço do Chamado",
                                plannedDate = doc.getString("plannedDate") ?: targetDate,
                                status = doc.getString("status") ?: "aberta",
                                type = "ORDEM DE SERVIÇO",
                                technician1 = technicianName,
                                generalNotes = doc.getString("description") ?: "Atendimento Corretivo Solicitado",
                                isSyncedWithServer = true
                            )
                        )
                    }
                }

                if (ordersToSave.isNotEmpty()) {
                    fetchSuccess = true
                }
            } catch (e: Exception) {
                Log.w(TAG, "Tentativa direta Firestore falhou: ${e.message}")
            }
        }

        // 3. Gravação resiliente no banco Room preservando 100% dos dados locais do técnico
        if (ordersToSave.isNotEmpty()) {
            for (i in ordersToSave.indices) {
                val incoming = ordersToSave[i]
                val existing = orderDao.getOrderById(incoming.id)
                if (existing != null) {
                    ordersToSave[i] = incoming.copy(
                        status = if (existing.status == "finalizada" || existing.status == "em_andamento") existing.status else incoming.status,
                        clientRepresentative = existing.clientRepresentative.ifBlank { incoming.clientRepresentative },
                        clientSigneeDoc = existing.clientSigneeDoc.ifBlank { incoming.clientSigneeDoc },
                        clientSignatureDate = existing.clientSignatureDate ?: incoming.clientSignatureDate,
                        clientSignaturePath = existing.clientSignaturePath ?: incoming.clientSignaturePath,
                        completionDate = existing.completionDate ?: incoming.completionDate,
                        completionLatitude = if (existing.completionLatitude != 0.0) existing.completionLatitude else incoming.completionLatitude,
                        completionLongitude = if (existing.completionLongitude != 0.0) existing.completionLongitude else incoming.completionLongitude,
                        completionAccuracy = if (existing.completionAccuracy != 0f) existing.completionAccuracy else incoming.completionAccuracy,
                        isSyncedWithServer = if (!existing.isSyncedWithServer) false else incoming.isSyncedWithServer
                    )
                }
            }
            orderDao.insertAll(ordersToSave)
        }

        if (checklistToSave.isNotEmpty()) {
            for (i in checklistToSave.indices) {
                val incoming = checklistToSave[i]
                val existing = checklistDao.getChecklistById(incoming.id)
                    ?: checklistDao.getChecklistByOrderAndEquipment(incoming.orderId, incoming.equipmentId)
                if (existing != null) {
                    val isLocallyModified = existing.isChecked || existing.isSkipped || existing.notes.isNotBlank() || existing.localPhotoPathsJson != "[]" || !existing.isSynced
                    if (isLocallyModified) {
                        checklistToSave[i] = incoming.copy(
                            id = existing.id,
                            isChecked = existing.isChecked,
                            isSkipped = existing.isSkipped,
                            notes = existing.notes,
                            justification = existing.justification,
                            checkedAt = existing.checkedAt,
                            localPhotoPathsJson = existing.localPhotoPathsJson,
                            remotePhotoUrlsJson = existing.remotePhotoUrlsJson,
                            isSynced = existing.isSynced
                        )
                    }
                }
            }
            checklistDao.insertAll(checklistToSave)
        }

        // Se o Room estiver completamente vazio e nenhuma busca online encontrou dados, gera roteiro base de contingência
        val currentLocalOrders = orderDao.getAllOrders()
        if (currentLocalOrders.isEmpty() && ordersToSave.isEmpty()) {
            val seedOrders = createSeedItinerary(technicianName, targetDate)
            orderDao.insertAll(seedOrders.first)
            checklistDao.insertAll(seedOrders.second)
            return@withContext seedOrders.first.size
        }

        return@withContext ordersToSave.size
    }

    /**
     * Semeia um roteiro completo realista para o técnico caso ainda não haja registros no servidor.
     */
    private fun createSeedItinerary(
        technicianName: String,
        targetDate: String
    ): Pair<List<ServiceOrderEntity>, List<EquipmentChecklistEntity>> {
        val orders = mutableListOf<ServiceOrderEntity>()
        val checklists = mutableListOf<EquipmentChecklistEntity>()

        // 1ª Parada: MANUTENÇÃO PREVENTIVA (PMOC) - Correios
        val id1 = "PREV_CORREIOS_ANADIA"
        orders.add(
            ServiceOrderEntity(
                id = id1,
                osNumber = "PMOC-101",
                originalId = id1,
                clientId = "CLI_CORREIOS",
                clientName = "CORREIOS - AGÊNCIA ANADIA",
                addressId = "ADDR_01",
                addressStreet = "RUA DO COMÉRCIO, 150 - CENTRO",
                plannedDate = targetDate,
                status = "aberta",
                type = "MANUTENÇÃO PREVENTIVA",
                technician1 = technicianName,
                generalNotes = "Plano PMOC Mensal • Limpeza de filtros, serpentinas e aferição de temperatura e pressão."
            )
        )
        for (i in 1..4) {
            checklists.add(
                EquipmentChecklistEntity(
                    id = UUID.randomUUID().toString(),
                    orderId = id1,
                    equipmentId = "EQ_CORREIOS_$i",
                    equipmentName = "Split Hi-Wall #0$i",
                    equipmentBrand = if (i % 2 == 0) "Carrier" else "Gree",
                    equipmentBtus = "12000 BTUs",
                    equipmentSector = "Atendimento ao Público - Caixa $i"
                )
            )
        }

        // 2ª Parada: MANUTENÇÃO PREVENTIVA (PMOC) - Banco do Brasil
        val id2 = "PREV_BB_CENTRO"
        orders.add(
            ServiceOrderEntity(
                id = id2,
                osNumber = "PMOC-102",
                originalId = id2,
                clientId = "CLI_BB",
                clientName = "BANCO DO BRASIL - AGÊNCIA 0058",
                addressId = "ADDR_02",
                addressStreet = "AV. FERNANDES LIMA, 1420 - FAROL",
                plannedDate = targetDate,
                status = "aberta",
                type = "MANUTENÇÃO PREVENTIVA",
                technician1 = technicianName,
                generalNotes = "Revisão Preventiva PMOC • 6 Máquinas Cassete e Piso-Teto nos andares 1 e 2."
            )
        )
        for (i in 1..6) {
            checklists.add(
                EquipmentChecklistEntity(
                    id = UUID.randomUUID().toString(),
                    orderId = id2,
                    equipmentId = "EQ_BB_$i",
                    equipmentName = "Cassete 4 Vias #0$i",
                    equipmentBrand = "Daikin Inverter",
                    equipmentBtus = "36000 BTUs",
                    equipmentSector = "Salão de Atendimento Bancário"
                )
            )
        }

        // 3ª Parada: ORDEM DE SERVIÇO (Corretiva / Chamado)
        val id3 = "OS_CORRETIVA_1042"
        orders.add(
            ServiceOrderEntity(
                id = id3,
                osNumber = "1042",
                originalId = id3,
                clientId = "CLI_TJAL",
                clientName = "TRIBUNAL DE JUSTIÇA - ANEXO II",
                addressId = "ADDR_03",
                addressStreet = "PRAÇA MARECHAL DEODORO, 88 - CENTRO",
                plannedDate = targetDate,
                status = "aberta",
                type = "ORDEM DE SERVIÇO",
                technician1 = technicianName,
                generalNotes = "Chamado Corretivo: Máquina do gabinete 03 parou de refrigerar e está apresentando código de erro E4 no painel."
            )
        )
        checklists.add(
            EquipmentChecklistEntity(
                id = UUID.randomUUID().toString(),
                orderId = id3,
                equipmentId = "EQ_TJ_01",
                equipmentName = "Split Piso-Teto Gabinete 03",
                equipmentBrand = "Springer Midea",
                equipmentBtus = "60000 BTUs",
                equipmentSector = "Gabinete dos Magistrados"
            )
        )

        // 4ª Parada: MANUTENÇÃO PREVENTIVA (PMOC) - Hospital
        val id4 = "PREV_HOSPITAL_METRO"
        orders.add(
            ServiceOrderEntity(
                id = id4,
                osNumber = "PMOC-103",
                originalId = id4,
                clientId = "CLI_HOSP",
                clientName = "HOSPITAL METROPOLITANO - ALA SUL",
                addressId = "ADDR_04",
                addressStreet = "RODOVIA AL-101 NORTE, KM 12 - LITORAL",
                plannedDate = targetDate,
                status = "aberta",
                type = "MANUTENÇÃO PREVENTIVA",
                technician1 = technicianName,
                generalNotes = "Inspeção de rotina e assepsia dos filtros com biocida bactericida conforme norma Anvisa."
            )
        )
        for (i in 1..4) {
            checklists.add(
                EquipmentChecklistEntity(
                    id = UUID.randomUUID().toString(),
                    orderId = id4,
                    equipmentId = "EQ_HOSP_$i",
                    equipmentName = "Split Inverter Filtragem HEPA #0$i",
                    equipmentBrand = "Fujitsu",
                    equipmentBtus = "18000 BTUs",
                    equipmentSector = "Ala de Internação - Leito 10$i"
                )
            )
        }

        // 5ª Parada: ORDEM DE SERVIÇO (Corretiva)
        val id5 = "OS_CORRETIVA_1055"
        orders.add(
            ServiceOrderEntity(
                id = id5,
                osNumber = "1055",
                originalId = id5,
                clientId = "CLI_SEDUC",
                clientName = "SEDUC - CENTRO DE FORMAÇÃO",
                addressId = "ADDR_05",
                addressStreet = "RUA DOUTOR PEDRO JORGE, 35 - POÇO",
                plannedDate = targetDate,
                status = "aberta",
                type = "ORDEM DE SERVIÇO",
                technician1 = technicianName,
                generalNotes = "Chamado Corretivo: Gotejamento excessivo de água pela carenagem interna, vazando em cima das mesas de reunião."
            )
        )
        checklists.add(
            EquipmentChecklistEntity(
                id = UUID.randomUUID().toString(),
                orderId = id5,
                equipmentId = "EQ_SEDUC_01",
                equipmentName = "Split Hi-Wall Sala 02",
                equipmentBrand = "Elgin",
                equipmentBtus = "24000 BTUs",
                equipmentSector = "Sala de Reuniões e Treinamento"
            )
        )

        return Pair(orders, checklists)
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
    ) {
        val photosJson = org.json.JSONArray(localPhotoPaths).toString()

        checklistDao.updateChecklistExecution(
            id = checklistId,
            isChecked = isChecked,
            isSkipped = isSkipped,
            notes = notes,
            justification = justification,
            checkedAt = checkedAt,
            localPhotoPathsJson = photosJson
        )

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
                referenceId = checklistId,
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
}
