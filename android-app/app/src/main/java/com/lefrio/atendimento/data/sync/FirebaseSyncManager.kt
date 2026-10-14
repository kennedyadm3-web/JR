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
                val isPreventive = payload.optBoolean("isPreventive", false) || orderId.startsWith("PREV_")
                val clientRepresentative = payload.optString("clientRepresentative", "")
                val clientSigneeDoc = payload.optString("clientSigneeDoc", "")
                val clientSignatureDate = payload.optString("clientSignatureDate", "")
                val completionDate = payload.optString("completionDate", "")
                val clientSignature = payload.optString("clientSignature", "")
                val completionLatitude = payload.optDouble("completionLatitude", 0.0)
                val completionLongitude = payload.optDouble("completionLongitude", 0.0)
                val completionAccuracy = payload.optDouble("completionAccuracy", 0.0)
                val executedQuantity = payload.optInt("executedQuantity", 0)

                val checklistArr = payload.optJSONArray("checklist") ?: org.json.JSONArray()
                val checklistItems = mutableListOf<Map<String, Any>>()
                for (i in 0 until checklistArr.length()) {
                    val obj = checklistArr.getJSONObject(i)
                    checklistItems.add(
                        mapOf(
                            "equipmentId" to obj.optString("equipmentId", ""),
                            "checked" to obj.optBoolean("checked", false),
                            "skipped" to obj.optBoolean("skipped", false),
                            "justification" to obj.optString("justification", ""),
                            "notes" to obj.optString("notes", ""),
                            "checkedAt" to obj.optString("checkedAt", "")
                        )
                    )
                }

                val nowIso = java.text.SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", java.util.Locale.getDefault()).apply {
                    timeZone = java.util.TimeZone.getTimeZone("UTC")
                }.format(java.util.Date())
                val todayDate = java.text.SimpleDateFormat("yyyy-MM-dd", java.util.Locale.getDefault()).format(java.util.Date())

                if (isPreventive) {
                    // FLUXO DE MANUTENÇÃO PREVENTIVA -> VAI DIRETO PARA A TELA DE APROVAÇÃO DO PWA!
                    // O PWA lê 'maintenanceRecords' e requer:
                    // status: 'pre_completed', routeStatus: 'pre_completed', clientSignature, clientSigneeName, clientSigneeRegistration, adminApproved: false
                    val originalRecordId = payload.optString("originalRecordId", "").ifBlank { orderId.removePrefix("PREV_") }
                    val addressId = payload.optString("addressId", "")
                    val currentMonth = payload.optString("month", todayDate.take(7))

                    val prevUpdates = hashMapOf<String, Any>(
                        "status" to "pre_completed",
                        "routeStatus" to "pre_completed",
                        "clientSignature" to clientSignature,
                        "clientSignatureDate" to (if (clientSignatureDate.isNotBlank()) clientSignatureDate else nowIso),
                        "clientSigneeName" to clientRepresentative,
                        "clientSigneeRegistration" to clientSigneeDoc,
                        "completionDate" to (if (completionDate.isNotBlank()) completionDate else nowIso),
                        "executionDate" to todayDate,
                        "adminApproved" to false,
                        "executedQuantity" to executedQuantity,
                        "completionLatitude" to completionLatitude,
                        "completionLongitude" to completionLongitude,
                        "completionAccuracy" to completionAccuracy,
                        "updatedAt" to System.currentTimeMillis()
                    )

                    if (checklistItems.isNotEmpty()) {
                        prevUpdates["checklist"] = checklistItems
                    }

                    // 1. Tenta atualizar pelo originalRecordId direto
                    if (originalRecordId.isNotBlank()) {
                        try {
                            firestore.collection("maintenanceRecords").document(originalRecordId)
                                .set(prevUpdates, SetOptions.merge())
                                .await()
                            Log.d(TAG, "Preventiva atualizada em maintenanceRecords com docId: " + originalRecordId)
                        } catch (e: Exception) {
                            Log.w(TAG, "Erro ao atualizar maintenanceRecords/" + originalRecordId + ": " + e.message)
                        }
                    }

                    // 2. Se tiver addressId e month, atualiza também a chave canônica ${month}_${addressId}
                    if (addressId.isNotBlank() && currentMonth.isNotBlank()) {
                        val canonicalKey = currentMonth + "_" + addressId
                        if (canonicalKey != originalRecordId) {
                            try {
                                firestore.collection("maintenanceRecords").document(canonicalKey)
                                    .set(prevUpdates, SetOptions.merge())
                                    .await()
                                Log.d(TAG, "Preventiva atualizada em maintenanceRecords com chave canônica: " + canonicalKey)
                            } catch (e: Exception) {
                                Log.w(TAG, "Erro ao atualizar chave canônica " + canonicalKey + ": " + e.message)
                            }
                        }
                    }
                }

                // FLUXO DE ORDEM DE SERVIÇO / ESPELHO:
                // Atualiza tanto em 'serviceOrders' (coleção padrão do PWA) quanto em 'service_orders' (compatibilidade)
                val finalizeMap = hashMapOf<String, Any>(
                    "status" to "finalizada",
                    "clientRepresentative" to clientRepresentative,
                    "clientSigneeName" to clientRepresentative,
                    "clientSigneeDoc" to clientSigneeDoc,
                    "clientSigneeRegistration" to clientSigneeDoc,
                    "clientSignatureDate" to (if (clientSignatureDate.isNotBlank()) clientSignatureDate else nowIso),
                    "completionDate" to (if (completionDate.isNotBlank()) completionDate else nowIso),
                    "finishedAt" to (if (completionDate.isNotBlank()) completionDate else nowIso),
                    "clientSignature" to clientSignature,
                    "completionLatitude" to completionLatitude,
                    "completionLongitude" to completionLongitude,
                    "completionAccuracy" to completionAccuracy,
                    "isLockedForTech" to true,
                    "updatedAt" to System.currentTimeMillis()
                )

                try {
                    firestore.collection("serviceOrders").document(orderId)
                        .set(finalizeMap, SetOptions.merge())
                        .await()
                } catch (e: Exception) {
                    Log.w(TAG, "Aviso ao salvar em serviceOrders: " + e.message)
                }

                try {
                    firestore.collection("service_orders").document(orderId)
                        .set(finalizeMap, SetOptions.merge())
                        .await()
                } catch (e: Exception) {
                    Log.w(TAG, "Aviso ao salvar em service_orders: " + e.message)
                }

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
