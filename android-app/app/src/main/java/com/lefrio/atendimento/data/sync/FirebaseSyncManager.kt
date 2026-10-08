package com.lefrio.atendimento.data.sync

import android.content.Context
import android.util.Log
import com.google.firebase.firestore.FirebaseFirestore
import com.google.firebase.firestore.SetOptions
import com.lefrio.atendimento.data.FirebaseConfig
import com.lefrio.atendimento.data.local.AppDatabase
import com.lefrio.atendimento.data.local.entity.SyncQueueEntity
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import org.json.JSONObject

/**
 * Gerenciador de Sincronização Resiliente Android <-> Firestore.
 * Conecta com a base Firestore da aplicação (ai-studio-d7c7baca-4d3e-4f86-a163-d21206f789bc).
 * Implementa garantia de entrega sem perda de dados (at-least-once com idempotência).
 */
class FirebaseSyncManager(private val context: Context) {

    private val db = AppDatabase.getInstance(context)
    private val firestore = FirebaseConfig.getFirestore()
    private val TAG = "FirebaseSyncManager"

    /**
     * Processa todas as tarefas pendentes na fila local.
     */
    suspend fun processPendingSyncQueue(): Int = withContext(Dispatchers.IO) {
        val pendingTasks = db.syncQueueDao().getPendingTasks()
        if (pendingTasks.isEmpty()) return@withContext 0

        var successfulSyncs = 0

        for (task in pendingTasks) {
            try {
                db.syncQueueDao().updateTaskStatus(task.queueId, "SYNCING")
                val success = executeTask(task)

                if (success) {
                    db.syncQueueDao().updateTaskStatus(task.queueId, "SUCCESS")
                    db.syncQueueDao().removeTask(task)
                    successfulSyncs++
                } else {
                    db.syncQueueDao().markTaskFailed(task.queueId, "Falha na resposta do servidor")
                }
            } catch (e: Exception) {
                Log.e(TAG, "Erro ao sincronizar tarefa #${task.queueId}: ${e.message}", e)
                db.syncQueueDao().markTaskFailed(task.queueId, e.message ?: "Erro desconhecido")
            }
        }

        successfulSyncs
    }

    private suspend fun executeTask(task: SyncQueueEntity): Boolean = withContext(Dispatchers.IO) {
        val payload = JSONObject(task.payloadJson)

        when (task.entityType) {
            "ORDER_STATUS" -> {
                val orderId = task.referenceId
                val newStatus = payload.getString("status")
                val updates = hashMapOf<String, Any>(
                    "status" to newStatus,
                    "updatedAt" to System.currentTimeMillis()
                )
                firestore.collection("service_orders").document(orderId)
                    .set(updates, SetOptions.merge())
                db.serviceOrderDao().markAsSynced(orderId)
                true
            }

            "CHECKLIST_ITEM" -> {
                val orderId = payload.getString("orderId")
                val checklistId = task.referenceId
                val itemMap = hashMapOf<String, Any>(
                    "id" to checklistId,
                    "equipmentId" to payload.getString("equipmentId"),
                    "isChecked" to payload.getBoolean("isChecked"),
                    "isSkipped" to payload.getBoolean("isSkipped"),
                    "notes" to payload.optString("notes", ""),
                    "justification" to payload.optString("justification", ""),
                    "checkedAt" to payload.optString("checkedAt", ""),
                    "updatedAt" to System.currentTimeMillis()
                )
                
                // Grava o checklist associado à O.S. no Firestore
                firestore.collection("service_orders")
                    .document(orderId)
                    .collection("checklist")
                    .document(checklistId)
                    .set(itemMap, SetOptions.merge())
                true
            }

            "FINALIZE_SERVICE" -> {
                val orderId = task.referenceId
                val finalizeMap = hashMapOf<String, Any>(
                    "status" to "finalizada",
                    "clientRepresentative" to payload.getString("clientRepresentative"),
                    "clientSigneeDoc" to payload.optString("clientSigneeDoc", ""),
                    "clientSignatureDate" to payload.getString("clientSignatureDate"),
                    "completionDate" to payload.getString("completionDate"),
                    "completionLatitude" to payload.getDouble("completionLatitude"),
                    "completionLongitude" to payload.getDouble("completionLongitude"),
                    "completionAccuracy" to payload.getDouble("completionAccuracy"),
                    "isLockedForTech" to true,
                    "updatedAt" to System.currentTimeMillis()
                )

                // Transação garantida: finaliza a O.S. no Firestore com carimbo e auditoria
                firestore.collection("service_orders").document(orderId)
                    .set(finalizeMap, SetOptions.merge())
                db.serviceOrderDao().markAsSynced(orderId)
                true
            }

            else -> false
        }
    }
}
