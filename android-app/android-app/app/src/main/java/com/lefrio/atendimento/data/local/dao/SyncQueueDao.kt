package com.lefrio.atendimento.data.local.dao

import androidx.room.*
import com.lefrio.atendimento.data.local.entity.SyncQueueEntity
import kotlinx.coroutines.flow.Flow

@Dao
interface SyncQueueDao {

    @Query("SELECT * FROM sync_queue WHERE status = 'PENDING' ORDER BY createdAt ASC")
    suspend fun getPendingTasks(): List<SyncQueueEntity>

    @Query("SELECT COUNT(*) FROM sync_queue WHERE status = 'PENDING'")
    fun getPendingTasksCountFlow(): Flow<Int>

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

    @Delete
    suspend fun removeTask(task: SyncQueueEntity)

    @Query("DELETE FROM sync_queue WHERE status = 'SUCCESS'")
    suspend fun clearCompletedTasks()
}
