package com.lefrio.atendimento.data.sync

import android.content.Context
import android.util.Log
import com.google.firebase.firestore.FieldValue
import com.google.firebase.firestore.SetOptions
import com.google.firebase.firestore.Source
import com.lefrio.atendimento.data.FirebaseConfig
import com.lefrio.atendimento.data.local.AppDatabase
import com.lefrio.atendimento.data.local.entity.SyncQueueEntity
import com.lefrio.atendimento.data.local.entity.isRemovalRequested
import com.lefrio.atendimento.util.NetworkMonitor
import com.lefrio.atendimento.util.PhotoCaptureManager
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.coroutines.tasks.await
import kotlinx.coroutines.withContext
import kotlinx.coroutines.withTimeout
import kotlinx.coroutines.withTimeoutOrNull
import org.json.JSONArray
import org.json.JSONObject
import java.io.File

/**
 * Gerenciador de Sincronização Resiliente Android <-> Firestore.
 * Conecta com a base Firestore da aplicação (ai-studio-d7c7baca-4d3e-4f86-a163-d21206f789bc).
 * Implementa garantia real de entrega (at-least-once com idempotência, Mutex anti-duplicação,
 * verificação de internet validada e confirmação real do servidor via Source.SERVER e timeout).
 */
class FirebaseSyncManager(private val context: Context) {

    companion object {
        private val syncMutex = Mutex()
    }

    private val db = AppDatabase.getInstance(context)
    private val firestore = FirebaseConfig.getFirestore()
    private val TAG = "FirebaseSyncManager"

    /**
     * Processa todas as tarefas pendentes (incluindo falhas anteriores ou interrompidas) na fila local.
     * Nunca trava quando o aparelho está offline e nunca remove uma tarefa sem confirmação real do servidor.
     */
    suspend fun processPendingSyncQueue(): Int = withContext(Dispatchers.IO) {
        if (!NetworkMonitor.hasValidatedInternet(context)) {
            Log.d(TAG, "Aparelho sem internet validada. Fila local preservada para envio automático posterior.")
            return@withContext 0
        }

        syncMutex.withLock {
            if (!NetworkMonitor.hasValidatedInternet(context)) {
                return@withLock 0
            }

            val pendingTasks = db.syncQueueDao().getPendingTasks()
            if (pendingTasks.isEmpty()) return@withLock 0

            // Garante autenticação Firebase antes de tentar enviar
            val authOk = withTimeoutOrNull(10_000L) {
                FirebaseConfig.ensureAuthenticated()
                true
            } ?: false

            if (!authOk) {
                Log.w(TAG, "Timeout ao autenticar no Firebase. Tarefas mantidas na fila local.")
                return@withLock 0
            }

            var successfulSyncs = 0

            for (task in pendingTasks) {
                if (!NetworkMonitor.hasValidatedInternet(context)) {
                    Log.w(TAG, "Conexão caiu durante a fila de envio. Mantendo tarefas restantes salvas.")
                    break
                }

                try {
                    db.syncQueueDao().updateTaskStatus(task.queueId, "SYNCING")
                    val success = executeTask(task)

                    if (success) {
                        db.syncQueueDao().updateTaskStatus(task.queueId, "SUCCESS")
                        db.syncQueueDao().removeTask(task)
                        successfulSyncs++
                    } else {
                        db.syncQueueDao().markTaskFailed(task.queueId, "Aguardando confirmação do servidor")
                    }
                } catch (e: Exception) {
                    Log.e(TAG, "Erro ao sincronizar tarefa #${task.queueId} (${task.entityType}): ${e.message}")
                    db.syncQueueDao().markTaskFailed(task.queueId, e.message ?: "Conexão instável")
                }
            }

            successfulSyncs
        }
    }

    private suspend fun executeTask(task: SyncQueueEntity): Boolean = withContext(Dispatchers.IO) {
        val payload = JSONObject(task.payloadJson)

        when (task.entityType) {
            "ORDER_STATUS" -> {
                val orderId = task.referenceId
                val newStatus = payload.optString("status", "em_andamento")

                if (orderId.startsWith("PREV_")) {
                    val recId = orderId.removePrefix("PREV_")
                    val recRef = firestore.collection("maintenanceRecords").document(recId)
                    val recSnap = withTimeout(12_000L) { recRef.get(Source.SERVER).await() }
                    if (recSnap.exists()) {
                        val pDate = (recSnap.getString("plannedDate") ?: "").trim()
                        val t1 = (recSnap.getString("technician1") ?: "").trim()
                        if (pDate.isBlank() && t1.isBlank()) {
                            return@withContext true
                        }
                        val currentServerStatus = recSnap.getString("status") ?: "pending"
                        if (currentServerStatus != "completed" && currentServerStatus != "pre_completed") {
                            val mappedStatus = if (newStatus == "em_andamento") "in_progress" else newStatus
                            withTimeout(12_000L) {
                                recRef.set(
                                    hashMapOf(
                                        "status" to mappedStatus,
                                        "updatedAt" to System.currentTimeMillis()
                                    ),
                                    SetOptions.merge()
                                ).await()
                            }
                        }
                    }
                } else {
                    withTimeout(12_000L) {
                        firestore.collection("serviceOrders").document(orderId)
                            .set(
                                hashMapOf<String, Any>(
                                    "status" to newStatus,
                                    "updatedAt" to System.currentTimeMillis()
                                ),
                                SetOptions.merge()
                            )
                            .await()
                    }
                }

                // Só marca a O.S. como sincronizada se não houver outras tarefas pendentes (ex: FINALIZE_SERVICE) para ela
                val remainingForOrder = db.syncQueueDao().countPendingTasksForOrder(orderId)
                if (remainingForOrder <= 1) {
                    db.serviceOrderDao().markAsSynced(orderId)
                }
                true
            }

            "ADD_EQUIPMENT" -> {
                val eqId = payload.optString("equipmentId", task.referenceId)
                val checklistId = payload.optString("checklistId", "")
                val orderId = payload.optString("orderId", "")
                val originalRecordId = payload.optString("originalRecordId", orderId.removePrefix("PREV_"))
                val addressId = payload.optString("addressId", "")
                val eqName = payload.optString("name", "SPLIT HI-WALL")
                val label = payload.optString("label", "01")
                val patrimony = payload.optString("patrimony", "")
                val sector = payload.optString("sector", "Geral")
                val brand = payload.optString("brand", "Não informada")
                val btus = payload.optString("btus", "12000")
                val notes = payload.optString("notes", "Adicionado pelo técnico na visita")

                val eqMap = hashMapOf<String, Any>(
                    "addressId" to addressId,
                    "name" to eqName,
                    "label" to label,
                    "patrimony" to patrimony,
                    "sector" to sector,
                    "brand" to brand,
                    "btus" to btus,
                    "addedByTech" to true,
                    "isPendingApproval" to true,
                    "status" to "active",
                    "active" to true,
                    "createdAt" to System.currentTimeMillis(),
                    "updatedAt" to System.currentTimeMillis()
                )

                withTimeout(15_000L) {
                    firestore.collection("equipments").document(eqId)
                        .set(eqMap, SetOptions.merge())
                        .await()
                }

                // Vincula no checklist do atendimento preventivo no servidor
                if (orderId.startsWith("PREV_") && originalRecordId.isNotBlank()) {
                    val recRef = firestore.collection("maintenanceRecords").document(originalRecordId)
                    val recSnap = withTimeout(12_000L) { recRef.get(Source.SERVER).await() }
                    if (recSnap.exists()) {
                        val pDate = (recSnap.getString("plannedDate") ?: "").trim()
                        val t1 = (recSnap.getString("technician1") ?: "").trim()
                        if (pDate.isNotBlank() || t1.isNotBlank()) {
                            @Suppress("UNCHECKED_CAST")
                            val currentListRaw = recSnap.get("checklist") as? List<Map<String, Any>> ?: emptyList()
                            val updatedList = currentListRaw.map { it.toMutableMap() }.toMutableList()
                            if (updatedList.none { (it["equipmentId"] as? String) == eqId }) {
                                updatedList.add(
                                    hashMapOf(
                                        "equipmentId" to eqId,
                                        "checked" to false,
                                        "skipped" to false,
                                        "requestedRemoval" to false,
                                        "notes" to notes,
                                        "photos" to emptyList<String>()
                                    )
                                )
                                withTimeout(12_000L) {
                                    recRef.set(
                                        hashMapOf(
                                            "checklist" to updatedList,
                                            "updatedAt" to System.currentTimeMillis()
                                        ),
                                        SetOptions.merge()
                                    ).await()
                                }
                            }
                        }
                    }
                }

                if (checklistId.isNotBlank()) {
                    db.equipmentChecklistDao().markAsSynced(checklistId)
                }
                true
            }

            "ORDER_EXTRAS" -> {
                val orderId = payload.optString("orderId", task.referenceId)
                val originalRecordId = payload.optString("originalRecordId", orderId.removePrefix("PREV_"))
                val routeNotes = payload.optString("routeNotes", "")
                val otherPaths = parseJsonStringArray(payload.optJSONArray("otherPhotoPaths"))
                val encodedOtherPhotos = encodePhotosToDataUrls(otherPaths, maxCount = 4, maxDimension = 720, quality = 55)

                if (orderId.startsWith("PREV_") && originalRecordId.isNotBlank()) {
                    val recRef = firestore.collection("maintenanceRecords").document(originalRecordId)
                    val recSnap = withTimeout(12_000L) { recRef.get(Source.SERVER).await() }
                    if (recSnap.exists()) {
                        val pDate = (recSnap.getString("plannedDate") ?: "").trim()
                        val t1 = (recSnap.getString("technician1") ?: "").trim()
                        if (pDate.isBlank() && t1.isBlank()) {
                            return@withContext true
                        }
                        val updates = hashMapOf<String, Any>(
                            "routeNotes" to routeNotes,
                            "otherPhotos" to encodedOtherPhotos,
                            "updatedAt" to System.currentTimeMillis()
                        )
                        withTimeout(15_000L) {
                            recRef.set(updates, SetOptions.merge()).await()
                        }
                    }
                } else {
                    withTimeout(15_000L) {
                        firestore.collection("serviceOrders").document(orderId)
                            .set(
                                hashMapOf<String, Any>(
                                    "generalNotes" to routeNotes,
                                    "routeNotes" to routeNotes,
                                    "otherPhotos" to encodedOtherPhotos,
                                    "updatedAt" to System.currentTimeMillis()
                                ),
                                SetOptions.merge()
                            )
                            .await()
                    }
                }
                true
            }

            "CHECKLIST_ITEM" -> {
                val orderId = payload.getString("orderId")
                val checklistId = task.referenceId
                val eqId = payload.getString("equipmentId")
                val isRemovalRequested = payload.optBoolean("requestedRemoval", false)
                val isChecked = if (isRemovalRequested) false else payload.getBoolean("isChecked")
                val isSkipped = if (isRemovalRequested) false else payload.getBoolean("isSkipped")
                val notes = payload.optString("notes", "")
                val justification = if (isRemovalRequested) "" else payload.optString("justification", "")
                val checkedAt = payload.optString("checkedAt", "")
                val rawPhotoPaths = parseJsonStringArray(payload.optJSONArray("localPhotoPaths"))
                val encodedPhotos = encodePhotosToDataUrls(rawPhotoPaths, maxCount = 3, maxDimension = 720, quality = 55)

                val itemMap = hashMapOf<String, Any>(
                    "id" to checklistId,
                    "equipmentId" to eqId,
                    "checked" to isChecked,
                    "isChecked" to isChecked,
                    "skipped" to isSkipped,
                    "isSkipped" to isSkipped,
                    "requestedRemoval" to isRemovalRequested,
                    "notes" to notes,
                    "justification" to justification,
                    "checkedAt" to checkedAt,
                    "photos" to encodedPhotos,
                    "updatedAt" to System.currentTimeMillis()
                )
                if (isRemovalRequested) {
                    itemMap["removalReason"] = "Máquina não existe no local (solicitado pelo técnico)"
                    itemMap["requestedRemovalAt"] = checkedAt
                }

                // 1. Se for Manutenção Preventiva (PREV_xxx), exige confirmação real do servidor em maintenanceRecords
                if (orderId.startsWith("PREV_")) {
                    val recId = orderId.removePrefix("PREV_")
                    val recRef = firestore.collection("maintenanceRecords").document(recId)
                    val recSnap = withTimeout(12_000L) { recRef.get(Source.SERVER).await() }

                    if (recSnap.exists()) {
                        val pDate = (recSnap.getString("plannedDate") ?: "").trim()
                        val t1 = (recSnap.getString("technician1") ?: "").trim()
                        if (pDate.isBlank() && t1.isBlank()) {
                            // Agendamento excluído pelo administrativo: descarta pendência obsoleta
                            Log.w(TAG, "Checklist ignorado: agendamento $recId foi excluído pelo administrativo.")
                            return@withContext true
                        }

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
                            "requestedRemoval" to isRemovalRequested,
                            "notes" to notes,
                            "justification" to justification,
                            "checkedAt" to checkedAt,
                            "photos" to encodedPhotos
                        )
                        if (isRemovalRequested) {
                            newItem["removalReason"] = "Máquina não existe no local (solicitado pelo técnico)"
                            newItem["requestedRemovalAt"] = checkedAt
                        }
                        if (existingIndex >= 0) {
                            updatedList[existingIndex] = newItem
                        } else {
                            updatedList.add(newItem)
                        }
                        val executedCount = updatedList.count {
                            (it["checked"] as? Boolean == true) &&
                                (it["skipped"] as? Boolean != true) &&
                                (it["requestedRemoval"] as? Boolean != true)
                        }
                        val serverStatus = recSnap.getString("status") ?: "pending"
                        val nextStatus = when {
                            serverStatus == "completed" || serverStatus == "pre_completed" -> serverStatus
                            executedCount > 0 -> "in_progress"
                            else -> serverStatus
                        }
                        withTimeout(15_000L) {
                            recRef.set(
                                hashMapOf(
                                    "checklist" to updatedList,
                                    "executedQuantity" to executedCount,
                                    "status" to nextStatus,
                                    "updatedAt" to System.currentTimeMillis()
                                ),
                                SetOptions.merge()
                            ).await()
                        }
                    }
                } else {
                    withTimeout(15_000L) {
                        firestore.collection("serviceOrders")
                            .document(orderId)
                            .collection("checklist")
                            .document(checklistId)
                            .set(itemMap, SetOptions.merge())
                            .await()
                    }
                }

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
                val signatureFilePath = payload.optString("signatureFilePath", "")

                // Recupera Base64 do payload ou relê do arquivo físico salvo no aparelho como garantia extra
                val clientSignature = payload.optString("clientSignature", "").ifBlank {
                    if (signatureFilePath.isNotBlank()) {
                        com.lefrio.atendimento.ui.signature.components.convertFileToBase64(File(signatureFilePath)) ?: ""
                    } else ""
                }

                val completionLatitude = payload.optDouble("completionLatitude", 0.0)
                val completionLongitude = payload.optDouble("completionLongitude", 0.0)
                val completionAccuracy = payload.optDouble("completionAccuracy", 0.0)
                val executedQuantity = payload.optInt("executedQuantity", 0)
                val techName = payload.optString("technician1", "").trim().ifBlank { "TÉCNICO" }.uppercase()
                val clientName = payload.optString("clientName", "").trim().ifBlank { "Cliente" }
                val addressStreet = payload.optString("addressStreet", "").trim().ifBlank { "Endereço" }
                val osNumber = payload.optString("osNumber", "").trim()

                val routeNotes = payload.optString("routeNotes", "")
                val otherPhotoPaths = parseJsonStringArray(payload.optJSONArray("otherPhotoPaths"))

                val checklistArr = payload.optJSONArray("checklist") ?: JSONArray()
                // Calcula quantas fotos existem no total para ajustar compressão e nunca estourar o limite de 1MB do Firestore
                var totalPhotoCount = otherPhotoPaths.size
                for (i in 0 until checklistArr.length()) {
                    val obj = checklistArr.getJSONObject(i)
                    totalPhotoCount += (obj.optJSONArray("localPhotoPaths")?.length() ?: 0)
                }
                val photoMaxDim = if (totalPhotoCount > 6) 560 else 720
                val photoQuality = if (totalPhotoCount > 6) 45 else 55
                var remainingPhotoBudgetBytes = 680_000 // Reserva margem segura abaixo de 1MB para assinatura + checklist

                val encodedOtherPhotos = mutableListOf<String>()
                for (p in encodePhotosToDataUrls(otherPhotoPaths, maxCount = 4, maxDimension = photoMaxDim, quality = photoQuality)) {
                    if (p.length <= remainingPhotoBudgetBytes) {
                        encodedOtherPhotos.add(p)
                        remainingPhotoBudgetBytes -= p.length
                    }
                }

                val checklistItems = mutableListOf<Map<String, Any>>()
                for (i in 0 until checklistArr.length()) {
                    val obj = checklistArr.getJSONObject(i)
                    val isRemovalReq = obj.optBoolean("requestedRemoval", false)
                    val itemRawPhotos = parseJsonStringArray(obj.optJSONArray("localPhotoPaths"))
                    val encodedItemPhotos = mutableListOf<String>()
                    for (p in encodePhotosToDataUrls(itemRawPhotos, maxCount = 3, maxDimension = photoMaxDim, quality = photoQuality)) {
                        if (p.length <= remainingPhotoBudgetBytes) {
                            encodedItemPhotos.add(p)
                            remainingPhotoBudgetBytes -= p.length
                        }
                    }

                    val itemEntry = hashMapOf<String, Any>(
                        "equipmentId" to obj.optString("equipmentId", ""),
                        "checked" to if (isRemovalReq) false else obj.optBoolean("checked", false),
                        "skipped" to if (isRemovalReq) false else obj.optBoolean("skipped", false),
                        "requestedRemoval" to isRemovalReq,
                        "justification" to if (isRemovalReq) "" else obj.optString("justification", ""),
                        "notes" to obj.optString("notes", ""),
                        "checkedAt" to obj.optString("checkedAt", ""),
                        "photos" to encodedItemPhotos
                    )
                    if (isRemovalReq) {
                        itemEntry["removalReason"] = "Máquina não existe no local (solicitado pelo técnico)"
                        itemEntry["requestedRemovalAt"] = obj.optString("checkedAt", completionDate)
                    }
                    checklistItems.add(itemEntry)
                }

                val nowIso = java.text.SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", java.util.Locale.getDefault()).apply {
                    timeZone = java.util.TimeZone.getTimeZone("UTC")
                }.format(java.util.Date())
                val todayDate = java.text.SimpleDateFormat("yyyy-MM-dd", java.util.Locale.getDefault()).format(java.util.Date())

                if (isPreventive) {
                    // FLUXO DE MANUTENÇÃO PREVENTIVA -> VAI DIRETO PARA A TELA DE APROVAÇÃO DO SISTEMA ADMINISTRATIVO!
                    val originalRecordId = payload.optString("originalRecordId", "").ifBlank { orderId.removePrefix("PREV_") }
                    val addressId = payload.optString("addressId", "")
                    val currentMonth = payload.optString("month", todayDate.take(7))
                    val targetRecId = if (addressId.isNotBlank() && currentMonth.isNotBlank()) {
                        "${currentMonth}_${addressId}"
                    } else {
                        originalRecordId
                    }

                    val prevUpdates = hashMapOf<String, Any>(
                        "status" to "pre_completed",
                        "routeStatus" to "pre_completed",
                        "clientSignature" to clientSignature,
                        "clientSignatureDate" to (if (clientSignatureDate.isNotBlank()) clientSignatureDate else nowIso),
                        "clientSigneeName" to clientRepresentative,
                        "clientSigneeRegistration" to clientSigneeDoc,
                        "completionDate" to (if (completionDate.isNotBlank()) completionDate else nowIso),
                        "finishedAt" to (if (completionDate.isNotBlank()) completionDate else nowIso),
                        "techFinalizedAt" to (if (completionDate.isNotBlank()) completionDate else nowIso),
                        "techFinalized" to true,
                        "executionDate" to todayDate,
                        "adminApproved" to false,
                        "approvedAt" to FieldValue.delete(),
                        "approvedBy" to FieldValue.delete(),
                        "executedQuantity" to executedQuantity,
                        "routeNotes" to routeNotes,
                        "otherPhotos" to encodedOtherPhotos,
                        "completionLatitude" to completionLatitude,
                        "completionLongitude" to completionLongitude,
                        "completionAccuracy" to completionAccuracy,
                        "updatedAt" to System.currentTimeMillis()
                    )

                    if (checklistItems.isNotEmpty()) {
                        prevUpdates["checklist"] = checklistItems
                    }

                    var savedPreventive = false
                    val checkDocId = originalRecordId.ifBlank { targetRecId }
                    if (checkDocId.isNotBlank()) {
                        val currentSnap = withTimeoutOrNull(8_000L) {
                            firestore.collection("maintenanceRecords").document(checkDocId).get(Source.SERVER).await()
                        }
                        if (currentSnap != null && currentSnap.exists()) {
                            val currentPlannedDate = (currentSnap.getString("plannedDate") ?: "").trim()
                            val currentTech1 = (currentSnap.getString("technician1") ?: "").trim()
                            if (currentPlannedDate.isBlank() && currentTech1.isBlank()) {
                                // O agendamento foi excluído pelo setor administrativo!
                                // Remove localmente e cancela o reenvio para não ressuscitar o agendamento excluído.
                                Log.w(TAG, "Agendamento $checkDocId foi excluído pelo administrativo. Removendo ordem local $orderId.")
                                db.equipmentChecklistDao().deleteChecklistsForOrder(orderId)
                                db.serviceOrderDao().deleteOrderById(orderId)
                                return@withContext true
                            }
                        }
                    }

                    // 1. Atualiza pelo originalRecordId direto com confirmação real do servidor
                    if (originalRecordId.isNotBlank()) {
                        withTimeout(15_000L) {
                            firestore.collection("maintenanceRecords").document(originalRecordId)
                                .set(prevUpdates, SetOptions.merge())
                                .await()
                        }
                        savedPreventive = true
                        Log.d(TAG, "Preventiva confirmada no servidor em maintenanceRecords/$originalRecordId")
                    }

                    // 2. Se tiver addressId e month, atualiza também a chave canônica ${month}_${addressId}
                    if (targetRecId.isNotBlank() && targetRecId != originalRecordId) {
                        withTimeout(15_000L) {
                            firestore.collection("maintenanceRecords").document(targetRecId)
                                .set(prevUpdates, SetOptions.merge())
                                .await()
                        }
                        savedPreventive = true
                        Log.d(TAG, "Preventiva confirmada no servidor em maintenanceRecords/$targetRecId")
                    }

                    if (!savedPreventive) {
                        return@withContext false
                    }

                    // 3. Dispara notificação em tempo real para o painel administrativo (com timeout para não travar)
                    withTimeoutOrNull(8_000L) {
                        sendAdminNotification(
                            type = "tech_finish",
                            title = "Atendimento Concluído: $techName",
                            content = "O técnico $techName finalizou o atendimento no cliente $clientName ($addressStreet). Aguardando aprovação.",
                            recordId = targetRecId.ifBlank { originalRecordId },
                            includeManagers = false
                        )
                    }
                } else {
                    // FLUXO DE ORDEM DE SERVIÇO CORRETIVA: atualiza em 'serviceOrders'
                    val finalizeMap = hashMapOf<String, Any>(
                        "status" to "aberta",
                        "clientRepresentative" to clientRepresentative,
                        "clientSigneeName" to clientRepresentative,
                        "clientSigneeDoc" to clientSigneeDoc,
                        "clientSigneeRegistration" to clientSigneeDoc,
                        "clientSignatureDate" to (if (clientSignatureDate.isNotBlank()) clientSignatureDate else nowIso),
                        "completionDate" to (if (completionDate.isNotBlank()) completionDate else nowIso),
                        "finishedAt" to (if (completionDate.isNotBlank()) completionDate else nowIso),
                        "techFinalizedAt" to (if (completionDate.isNotBlank()) completionDate else nowIso),
                        "techFinalized" to true,
                        "adminFinalized" to false,
                        "clientSignature" to clientSignature,
                        "generalNotes" to routeNotes,
                        "routeNotes" to routeNotes,
                        "otherPhotos" to encodedOtherPhotos,
                        "completionLatitude" to completionLatitude,
                        "completionLongitude" to completionLongitude,
                        "completionAccuracy" to completionAccuracy,
                        "isLockedForTech" to true,
                        "updatedAt" to System.currentTimeMillis()
                    )

                    withTimeout(15_000L) {
                        firestore.collection("serviceOrders").document(orderId)
                            .set(finalizeMap, SetOptions.merge())
                            .await()
                    }

                    val osLabel = osNumber.ifBlank { orderId.takeLast(6).uppercase() }
                    withTimeoutOrNull(8_000L) {
                        sendAdminNotification(
                            type = "os_attended",
                            title = "Atendimento de Ordem de Serviço",
                            content = "O técnico $techName finalizou a ordem de serviço #$osLabel no cliente $clientName ($addressStreet).",
                            recordId = orderId,
                            includeManagers = true
                        )
                    }
                }

                db.equipmentChecklistDao().markAllAsSyncedForOrder(orderId)
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

                withTimeout(15_000L) {
                    firestore.collection("routeExpenses").document(expenseId)
                        .set(expenseMap, SetOptions.merge())
                        .await()
                }
                db.routeExpenseDao().markAsSynced(expenseId)
                true
            }

            "CREATE_SERVICE_ORDER" -> {
                val orderId = task.referenceId
                val osNumber = payload.optString("osNumber", "OS-${orderId.takeLast(4)}")
                val techName = payload.optString("technician1", "").trim().ifBlank { "TÉCNICO" }.uppercase()
                val clientName = payload.optString("clientName", "").trim().ifBlank { "Cliente" }
                val addressStreet = payload.optString("addressStreet", "").trim().ifBlank { "Endereço" }
                val isTechFinalized = payload.optBoolean("techFinalized", false)
                val sigPath = payload.optString("clientSignaturePath", "")
                val clientSig = payload.optString("clientSignature", "").ifBlank {
                    if (sigPath.isNotBlank()) {
                        com.lefrio.atendimento.ui.signature.components.convertFileToBase64(File(sigPath)) ?: ""
                    } else ""
                }

                val osMap = hashMapOf<String, Any>(
                    "id" to orderId,
                    "osNumber" to osNumber,
                    "clientId" to payload.optString("clientId", ""),
                    "clientName" to clientName,
                    "addressId" to payload.optString("addressId", ""),
                    "addressStreet" to addressStreet,
                    "equipmentId" to payload.optString("equipmentId", ""),
                    "equipmentName" to payload.optString("equipmentName", ""),
                    "status" to if (isTechFinalized) "aberta" else payload.optString("status", "aberta"),
                    "type" to payload.optString("type", "MANUTENÇÃO CORRETIVA CONTRATO"),
                    "plannedDate" to payload.optString("plannedDate", ""),
                    "technicianId" to payload.optString("technicianId", ""),
                    "technician1" to techName,
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
                    "finishedAt" to payload.optString("finishedAt", ""),
                    "techFinalizedAt" to payload.optString("techFinalizedAt", ""),
                    "techFinalized" to isTechFinalized,
                    "adminFinalized" to false,
                    "clientSignature" to clientSig,
                    "generalNotes" to payload.optString("generalNotes", ""),
                    "openedAt" to payload.optString("openedAt", ""),
                    "createdAt" to System.currentTimeMillis(),
                    "updatedAt" to System.currentTimeMillis()
                )

                withTimeout(15_000L) {
                    firestore.collection("serviceOrders").document(orderId)
                        .set(osMap, SetOptions.merge())
                        .await()
                }

                withTimeoutOrNull(8_000L) {
                    sendAdminNotification(
                        type = "os_attended",
                        title = "Atendimento de Ordem de Serviço",
                        content = "O técnico $techName registrou a ordem de serviço #$osNumber no cliente $clientName ($addressStreet).",
                        recordId = orderId,
                        includeManagers = true
                    )
                }

                db.serviceOrderDao().markAsSynced(orderId)
                true
            }

            else -> false
        }
    }

    private fun parseJsonStringArray(arr: JSONArray?): List<String> {
        if (arr == null) return emptyList()
        val list = mutableListOf<String>()
        for (i in 0 until arr.length()) {
            val v = arr.optString(i, "")
            if (v.isNotBlank()) list.add(v)
        }
        return list
    }

    private fun encodePhotosToDataUrls(
        rawPaths: List<String>,
        maxCount: Int,
        maxDimension: Int = 720,
        quality: Int = 55
    ): List<String> {
        if (rawPaths.isEmpty()) return emptyList()
        val photoMgr = PhotoCaptureManager(context)
        val result = mutableListOf<String>()
        for (path in rawPaths.take(maxCount)) {
            if (path.startsWith("data:image/") || path.startsWith("http://") || path.startsWith("https://")) {
                result.add(path)
            } else {
                val encoded = photoMgr.encodeFileToDataUrl(File(path), maxDimension, quality)
                if (!encoded.isNullOrBlank()) {
                    result.add(encoded)
                }
            }
        }
        return result
    }

    /**
     * Cria documentos na coleção 'notifications' para todos os usuários administrativos
     * (admin, assistant, support e opcionalmente manager), disparando o sino, popup e som no painel web.
     */
    private suspend fun sendAdminNotification(
        type: String,
        title: String,
        content: String,
        recordId: String,
        includeManagers: Boolean
    ) {
        try {
            val usersSnap = firestore.collection("users").get(Source.SERVER).await()
            val allowedRoles = if (includeManagers) {
                setOf("admin", "support", "assistant", "manager")
            } else {
                setOf("admin", "support", "assistant")
            }

            val sanitizedRecordId = recordId.replace("/", "_").ifBlank { System.currentTimeMillis().toString() }

            for (userDoc in usersSnap.documents) {
                val role = (userDoc.getString("role") ?: "").trim().lowercase()
                if (role !in allowedRoles) continue

                val notifData = hashMapOf<String, Any>(
                    "userId" to userDoc.id,
                    "title" to title,
                    "content" to content,
                    "type" to type,
                    "recordId" to recordId,
                    "read" to false,
                    "createdAt" to FieldValue.serverTimestamp()
                )
                // Mantém compatibilidade com PWA: apenas O.S./chamados usam callId; tech_finish usa somente recordId
                if (type != "tech_finish" && type != "tech_start") {
                    notifData["callId"] = recordId
                }

                // ID determinístico garante envio único mesmo em caso de retentativa offline:
                // na 1ª vez cria o documento; em eventual reenvio, a regra de update impede sobrescrever read=true
                val deterministicDocId = "${type}_${sanitizedRecordId}_${userDoc.id}"
                try {
                    firestore.collection("notifications")
                        .document(deterministicDocId)
                        .set(notifData)
                        .await()
                } catch (e: Exception) {
                    Log.w(TAG, "Notificação $deterministicDocId já enviada ou indisponível para ${userDoc.id}: ${e.message}")
                }
            }
        } catch (e: Exception) {
            Log.w(TAG, "Aviso ao listar usuários administrativos para notificação: ${e.message}")
        }
    }
}
