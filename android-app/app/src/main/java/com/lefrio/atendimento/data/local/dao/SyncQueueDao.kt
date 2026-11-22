package com.lefrio.atendimento.data.local.dao

import androidx.room.*
import com.lefrio.atendimento.data.local.entity.SyncQueueEntity
import kotlinx.coroutines.flow.Flow

@Dao
interface SyncQueueDao {

    /**
     * Retorna tarefas elegíveis para envio automático (exclui SUCCESS e QUARANTINED).
     * Garante prioridade para ADD_EQUIPMENT antes de FINALIZE_SERVICE para manter integridade referencial.
     */
    @Query("""
        SELECT * FROM sync_queue
        WHERE status IN ('PENDING', 'FAILED', 'SYNCING')
        ORDER BY CASE WHEN entityType = 'ADD_EQUIPMENT' THEN 0 ELSE 1 END ASC, createdAt ASC
    """)
    suspend fun getPendingTasks(): List<SyncQueueEntity>

    /**
     * Retorna todas as tarefas ainda não concluídas (incluindo QUARANTINED) para proteção de integridade offline.
     */
    @Query("SELECT * FROM sync_queue WHERE status != 'SUCCESS' ORDER BY createdAt ASC")
    suspend fun getAllUnfinishedTasks(): List<SyncQueueEntity>

    /**
     * Contagem total de tarefas ativas aguardando envio (exclui QUARANTINED para contagem separada na UI).
     */
    @Query("SELECT COUNT(*) FROM sync_queue WHERE status IN ('PENDING', 'FAILED', 'SYNCING')")
    fun getPendingTasksCountFlow(): Flow<Int>

    @Query("SELECT COUNT(*) FROM sync_queue WHERE status IN ('PENDING', 'FAILED', 'SYNCING')")
    suspend fun getPendingTasksCountSync(): Int

    /**
     * Contagem de tarefas em quarentena (falha persistente após limite máximo de retentativas).
     */
    @Query("SELECT COUNT(*) FROM sync_queue WHERE status = 'QUARANTINED'")
    fun getQuarantinedTasksCountFlow(): Flow<Int>

    @Query("SELECT COUNT(*) FROM sync_queue WHERE status = 'QUARANTINED'")
    suspend fun getQuarantinedTasksCountSync(): Int

    @Query("SELECT COUNT(*) FROM sync_queue WHERE status != 'SUCCESS' AND (referenceId = :orderId OR payloadJson LIKE '%' || :orderId || '%')")
    suspend fun countPendingTasksForOrder(orderId: String): Int

    @Query("DELETE FROM sync_queue WHERE entityType = :entityType AND referenceId = :referenceId AND status != 'SUCCESS'")
    suspend fun deletePendingByTypeAndRef(entityType: String, referenceId: String)

    /**
     * Compactação da fila (Coalescing): quando já existe FINALIZE_SERVICE para uma ordem,
     * descarta tarefas intermediárias redundantes (status, checklist item-a-item e extras) da mesma ordem.
     */
    @Query("""
        DELETE FROM sync_queue
        WHERE status != 'SUCCESS'
          AND entityType IN ('ORDER_STATUS', 'CHECKLIST_ITEM', 'ORDER_EXTRAS')
          AND (referenceId = :orderId OR payloadJson LIKE '%"orderId":"' || :orderId || '"%')
    """)
    suspend fun deleteRedundantTasksForOrder(orderId: String)

    @Insert
    suspend fun enqueue(task: SyncQueueEntity): Long

    @Query("UPDATE sync_queue SET status = :status, lastAttemptAt = :timestamp WHERE queueId = :queueId")
    suspend fun updateTaskStatus(queueId: Long, status: String, timestamp: Long = System.currentTimeMillis())

    @Query("""
        UPDATE sync_queue SET 
            status = 'FAILED', 
            retryCount = retryCount + 1, 
            lastErrorMessage = :errorMsg, 
            lastAttemptAt = :timestamp 
        WHERE queueId = :queueId
    """)
    suspend fun markTaskFailed(queueId: Long, errorMsg: String, timestamp: Long = System.currentTimeMillis())

    @Query("""
        UPDATE sync_queue SET 
            status = 'QUARANTINED', 
            retryCount = retryCount + 1, 
            lastErrorMessage = :errorMsg, 
            lastAttemptAt = :timestamp 
        WHERE queueId = :queueId
    """)
    suspend fun markTaskQuarantined(queueId: Long, errorMsg: String, timestamp: Long = System.currentTimeMillis())

    @Query("""
        UPDATE sync_queue SET 
            status = 'PENDING', 
            retryCount = 0, 
            lastErrorMessage = NULL, 
            lastAttemptAt = NULL 
        WHERE status = 'QUARANTINED'
    """)
    suspend fun retryAllQuarantinedTasks()

    @Delete
    suspend fun removeTask(task: SyncQueueEntity)

    @Query("DELETE FROM sync_queue WHERE status = 'SUCCESS'")
    suspend fun clearCompletedTasks()
}
