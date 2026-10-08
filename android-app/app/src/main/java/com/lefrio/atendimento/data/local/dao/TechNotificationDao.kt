package com.lefrio.atendimento.data.local.dao

import androidx.room.*
import com.lefrio.atendimento.data.local.entity.TechNotificationEntity
import kotlinx.coroutines.flow.Flow

@Dao
interface TechNotificationDao {

    @Query("SELECT * FROM tech_notifications ORDER BY timestamp DESC")
    fun getAllNotifications(): Flow<List<TechNotificationEntity>>

    @Query("SELECT COUNT(*) FROM tech_notifications WHERE isRead = 0")
    fun getUnreadCount(): Flow<Int>

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insertNotifications(notifications: List<TechNotificationEntity>)

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insertNotification(notification: TechNotificationEntity)

    @Query("UPDATE tech_notifications SET isRead = 1 WHERE id = :id")
    suspend fun markAsRead(id: String)

    @Query("UPDATE tech_notifications SET isRead = 1")
    suspend fun markAllAsRead()

    @Query("DELETE FROM tech_notifications WHERE id = :id")
    suspend fun deleteNotification(id: String)
}
