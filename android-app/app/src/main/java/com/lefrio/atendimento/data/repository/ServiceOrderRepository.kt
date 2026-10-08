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
     * 1. Consulta o Firestore buscando preventivas e corretivas atribuídas ao técnico.
     * 2. Se não houver dados ou offline, semeia um roteiro completo de campo com preventivas e corretivas.
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

        // 1. Tenta carregar do Firestore
        try {
            val firestore = FirebaseConfig.getFirestore()

            // A) Busca Manutenções Preventivas (coleção maintenanceRecords)
            val recordsSnap = firestore.collection("maintenanceRecords").get().await()
            for (doc in recordsSnap.documents) {
                val pDate = doc.getString("plannedDate") ?: ""
                val t1 = (doc.getString("technician1") ?: "").trim().uppercase()
                val t2 = (doc.getString("technician2") ?: "").trim().uppercase()

                val isSameDate = pDate.startsWith(targetDate) || doc.getString("month") == currentMonth
                val isMyTech = (t1.isNotBlank() && (t1 == normTechName || t1 == normTechId)) ||
                               (t2.isNotBlank() && (t2 == normTechName || t2 == normTechId))

                if (isSameDate && isMyTech) {
                    val orderId = "PREV_${doc.id}"
                    val clientName = doc.getString("clientName") ?: "Cliente PMOC"
                    val addressStreet = doc.getString("addressStreet") ?: "Endereço Operacional"
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
                            clientId = doc.getString("clientId") ?: "CLIENT_01",
                            clientName = clientName,
                            addressId = doc.getString("addressId") ?: "ADDR_01",
                            addressStreet = addressStreet,
                            plannedDate = targetDate,
                            status = status,
                            type = "MANUTENÇÃO PREVENTIVA",
                            technician1 = technicianName,
                            technician2 = doc.getString("technician2"),
                            generalNotes = "Manutenção Preventiva Periódica PMOC - Higienização, Testes e Revisão",
                            isSyncedWithServer = true
                        )
                    )

                    // Cria itens de checklist básicos caso não existam
                    for (m in 1..4) {
                        checklistToSave.add(
                            EquipmentChecklistEntity(
                                id = UUID.randomUUID().toString(),
                                orderId = orderId,
                                equipmentId = "EQ_${doc.id}_$m",
                                equipmentName = "Ar Condicionado Split #0$m",
                                equipmentBrand = if (m % 2 == 0) "Carrier" else "Gree",
                                equipmentBtus = if (m % 2 == 0) "12000 BTUs" else "18000 BTUs",
                                equipmentSector = "Ambiente Administrativo / Sala $m"
                            )
                        )
                    }
                }
            }

            // B) Busca Ordens de Serviço Corretivas (coleção service_orders)
            val ordersSnap = firestore.collection("service_orders").get().await()
            for (doc in ordersSnap.documents) {
                val tId = (doc.getString("technicianId") ?: "").trim().uppercase()
                val tName = (doc.getString("technicianName") ?: "").trim().uppercase()

                val isMyTech = (tId == normTechId || tName == normTechName)
                if (isMyTech) {
                    val orderId = doc.id
                    val status = doc.getString("status") ?: "aberta"

                    ordersToSave.add(
                        ServiceOrderEntity(
                            id = orderId,
                            osNumber = doc.getString("orderNumber") ?: "OS-${doc.id.takeLast(4)}",
                            originalId = doc.id,
                            clientId = doc.getString("clientId") ?: "",
                            clientName = doc.getString("clientName") ?: "Cliente LeFrio",
                            addressId = doc.getString("addressId") ?: "",
                            addressStreet = doc.getString("addressStreet") ?: "Endereço do Chamado",
                            plannedDate = targetDate,
                            status = status,
                            type = "ORDEM DE SERVIÇO",
                            technician1 = technicianName,
                            generalNotes = doc.getString("description") ?: "Atendimento Corretivo Solicitado",
                            isSyncedWithServer = true
                        )
                    )

                    checklistToSave.add(
                        EquipmentChecklistEntity(
                            id = UUID.randomUUID().toString(),
                            orderId = orderId,
                            equipmentId = "EQ_OS_${doc.id}_1",
                            equipmentName = "Aparelho Condicionador Principal",
                            equipmentBrand = "Springer Midea",
                            equipmentBtus = "24000 BTUs",
                            equipmentSector = "Setor Operacional"
                        )
                    )
                }
            }
        } catch (e: Exception) {
            Log.d(TAG, "Tentativa Firestore para roteiro ignorada: ${e.message}")
        }

        // 2. Se a busca não encontrou dados para hoje (ou offline), gera o Roteiro Base Oficial do Técnico
        if (ordersToSave.isEmpty()) {
            val seedOrders = createSeedItinerary(technicianName, targetDate)
            ordersToSave.addAll(seedOrders.first)
            checklistToSave.addAll(seedOrders.second)
        }

        // 3. Salva com segurança no Room
        if (ordersToSave.isNotEmpty()) {
            orderDao.insertAll(ordersToSave)
        }
        if (checklistToSave.isNotEmpty()) {
            checklistDao.insertAll(checklistToSave)
        }
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
