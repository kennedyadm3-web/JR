package com.lefrio.atendimento.data.repository

import android.content.Context
import com.lefrio.atendimento.data.local.AppDatabase
import com.lefrio.atendimento.data.local.entity.EquipmentChecklistEntity
import com.lefrio.atendimento.data.local.entity.ServiceOrderEntity
import com.lefrio.atendimento.data.local.entity.SyncQueueEntity
import com.lefrio.atendimento.data.sync.SyncWorker
import kotlinx.coroutines.flow.Flow
import org.json.JSONObject

/**
 * Repositório Central de Ordens de Serviço do Aplicativo Android.
 * Todas as escritas são garantidas primeiro no banco de dados local Room,
 * e simultaneamente enfileiradas para sincronização com o Firestore.
 */
class ServiceOrderRepository(private val context: Context) {

    private val db = AppDatabase.getInstance(context)
    private val orderDao = db.serviceOrderDao()
    private val checklistDao = db.equipmentChecklistDao()
    private val syncDao = db.syncQueueDao()

    fun getAllOrders(): Flow<List<ServiceOrderEntity>> = orderDao.getAllOrdersFlow()

    fun getOrderById(orderId: String): Flow<ServiceOrderEntity?> = orderDao.getOrderByIdFlow(orderId)

    fun getChecklistForOrder(orderId: String): Flow<List<EquipmentChecklistEntity>> =
        checklistDao.getChecklistForOrderFlow(orderId)

    /**
     * Atualiza o status da O.S. (ex: iniciar atendimento 'em_andamento').
     * Salva localmente e agenda envio imediato.
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
        // 1. Grava no banco local Room e tranca para edição
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

        // 2. Enfileira na fila de sincronização prioritária
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

        // 3. Dispara sincronização imediata
        SyncWorker.triggerImmediateSync(context)
    }
}
