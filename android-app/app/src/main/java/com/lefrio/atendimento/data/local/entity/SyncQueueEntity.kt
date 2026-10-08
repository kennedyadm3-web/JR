package com.lefrio.atendimento.data.local.entity

import androidx.room.Entity
import androidx.room.PrimaryKey

/**
 * Fila de Sincronização Offline-First à Prova de Falhas.
 * Garante que nenhuma operação de preenchimento, foto ou assinatura se perca.
 */
@Entity(tableName = "sync_queue")
data class SyncQueueEntity(
    @PrimaryKey(autoGenerate = true)
    val queueId: Long = 0,
    val entityType: String, // 'ORDER_STATUS', 'CHECKLIST_ITEM', 'PHOTO_UPLOAD', 'SIGNATURE_UPLOAD'
    val referenceId: String, // ID da O.S. ou ID do Checklist
    val actionType: String, // 'CREATE', 'UPDATE', 'FINALIZE'
    val payloadJson: String, // Dados brutos da operação serializados em JSON
    val status: String = "PENDING", // 'PENDING', 'SYNCING', 'SUCCESS', 'FAILED'
    val retryCount: Int = 0,
    val lastErrorMessage: String? = null,
    val createdAt: Long = System.currentTimeMillis(),
    val lastAttemptAt: Long? = null
)
