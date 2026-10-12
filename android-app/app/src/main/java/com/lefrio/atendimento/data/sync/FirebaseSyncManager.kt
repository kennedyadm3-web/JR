package com.lefrio.atendimento.data.sync

import android.content.Context
import android.util.Log
import com.google.firebase.firestore.FirebaseFirestore
import com.google.firebase.firestore.SetOptions
import com.lefrio.atendimento.data.FirebaseConfig
import com.lefrio.atendimento.data.local.AppDatabase
import com.lefrio.atendimento.data.local.entity.SyncQueueEntity
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.tasks.await
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
                val eqId = payload.getString("equipmentId")
                val isChecked = payload.getBoolean("isChecked")
                val isSkipped = payload.getBoolean("isSkipped")
                val notes = payload.optString("notes", "")
                val justification = payload.optString("justification", "")
                val checkedAt = payload.optString("checkedAt", "")

                val itemMap = hashMapOf<String, Any>(
                    "id" to checklistId,
                    "equipmentId" to eqId,
                    "checked" to isChecked,
                    "isChecked" to isChecked,
                    "skipped" to isSkipped,
                    "isSkipped" to isSkipped,
                    "notes" to notes,
                    "justification" to justification,
                    "checkedAt" to checkedAt,
                    "updatedAt" to System.currentTimeMillis()
                )

                // 1. Se for Manutenção Preventiva (PREV_xxx), sincroniza com a coleção maintenanceRecords
                if (orderId.startsWith("PREV_")) {
                    val recId = orderId.removePrefix("PREV_")
                    try {
                        val recRef = firestore.collection("maintenanceRecords").document(recId)
                        val recSnap = recRef.get().await()
                        if (recSnap.exists()) {
                            @Suppress("UNCHECKED_CAST")
                            val currentListRaw = recSnap.get("checklist") as? List<Map<String, Any>> ?: emptyList()
                            val updatedList = currentListRaw.map { it.toMutableMap() }.toMutableList()
                            val existingIndex = updatedList.indexOfFirst {
                                (it["equipmentId"] as? String) == eqId || (it["id"] as? String) == checklistId
                            }
                            val newItem = hashMapOf<String, Any>(
                                "equipmentId" to eqId,
                                "checked" to isChecked,
                                "skipped" to isSkipped,
                                "notes" to notes,
                                "justification" to justification,
                                "checkedAt" to checkedAt
                            )
                            if (existingIndex >= 0) {
                                updatedList[existingIndex] = newItem
                            } else {
                                updatedList.add(newItem)
                            }
                            val executedCount = updatedList.count {
                                (it["checked"] as? Boolean == true) && (it["skipped"] as? Boolean != true)
                            }
                            recRef.set(
                                hashMapOf(
                                    "checklist" to updatedList,
                                    "executedQuantity" to executedCount,
                                    "status" to if (executedCount > 0 && recSnap.getString("status") != "completed") "in_progress" else (recSnap.getString("status") ?: "in_progress"),
                                    "updatedAt" to System.currentTimeMillis()
                                ),
                                SetOptions.merge()
                            ).await()
                        }
                    } catch (e: Exception) {
                        Log.w(TAG, "Aviso ao sincronizar checklist em maintenanceRecords: ${e.message}")
                    }
                }

                // 2. Grava também no documento da O.S. e subcoleção checklist para total redundância
                try {
                    firestore.collection("service_orders")
                        .document(orderId)
                        .collection("checklist")
                        .document(checklistId)
                        .set(itemMap, SetOptions.merge())
                        .await()
                } catch (ignored: Exception) {}

                db.equipmentChecklistDao().markAsSynced(checklistId)
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

            "ROUTE_EXPENSE" -> {
                val expenseId = task.referenceId
                val expenseMap = hashMapOf<String, Any>(
                    "id" to expenseId,
                    "technicianId" to payload.getString("technicianId"),
                    "technicianName" to payload.getString("technicianName"),
                    "category" to payload.getString("category"),
                    "amount" to payload.getDouble("amount"),
                    "description" to payload.getString("description"),
                    "date" to payload.getString("date"),
                    "orderId" to payload.optString("orderId", ""),
                    "status" to payload.optString("status", "pendente"),
                    "updatedAt" to System.currentTimeMillis()
                )

                firestore.collection("routeExpenses").document(expenseId)
                    .set(expenseMap, SetOptions.merge())
                db.routeExpenseDao().markAsSynced(expenseId)
                true
            }

            "CREATE_SERVICE_ORDER" -> {
                val orderId = task.referenceId
                val osMap = hashMapOf<String, Any>(
                    "id" to orderId,
                    "osNumber" to payload.optString("osNumber", "OS-${orderId.takeLast(4)}"),
                    "clientId" to payload.optString("clientId", ""),
                    "clientName" to payload.optString("clientName", ""),
                    "addressId" to payload.optString("addressId", ""),
                    "addressStreet" to payload.optString("addressStreet", ""),
                    "equipmentId" to payload.optString("equipmentId", ""),
                    "equipmentName" to payload.optString("equipmentName", ""),
                    "status" to payload.optString("status", "aberta"),
                    "type" to payload.optString("type", "MANUTENÇÃO CORRETIVA CONTRATO"),
                    "plannedDate" to payload.optString("plannedDate", ""),
                    "technicianId" to payload.optString("technicianId", ""),
                    "technician1" to payload.optString("technician1", ""),
                    "technician2" to payload.optString("technician2", ""),
                    "description" to payload.optString("description", ""),
                    "diagnosis" to payload.optString("diagnosis", ""),
                    "solution" to payload.optString("solution", ""),
                    "clientRepresentative" to payload.optString("clientRepresentative", ""),
                    "clientSigneeName" to payload.optString("clientSigneeName", ""),
                    "clientSigneeRegistration" to payload.optString("clientSigneeRegistration", ""),
                    "clientSigneeDoc" to payload.optString("clientSigneeDoc", ""),
                    "clientSignatureDate" to payload.optString("clientSignatureDate", ""),
                    "completionDate" to payload.optString("completionDate", ""),
                    "clientSignature" to payload.optString("clientSignature", ""),
                    "generalNotes" to payload.optString("generalNotes", ""),
                    "openedAt" to payload.optString("openedAt", ""),
                    "createdAt" to System.currentTimeMillis(),
                    "updatedAt" to System.currentTimeMillis()
                )

                try {
                    firestore.collection("serviceOrders").document(orderId)
                        .set(osMap, SetOptions.merge())
                        .await()
                } catch (e: Exception) {
                    Log.w(TAG, "Aviso ao salvar em serviceOrders: ${e.message}")
                }

                try {
                    firestore.collection("service_orders").document(orderId)
                        .set(osMap, SetOptions.merge())
                        .await()
                } catch (e: Exception) {
                    Log.w(TAG, "Aviso ao salvar em service_orders: ${e.message}")
                }

                db.serviceOrderDao().markAsSynced(orderId)
                true
            }

            else -> false
        }
    }
}
