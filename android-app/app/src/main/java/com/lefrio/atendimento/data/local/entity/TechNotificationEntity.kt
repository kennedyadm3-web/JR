package com.lefrio.atendimento.data.local.entity

import androidx.room.Entity
import androidx.room.PrimaryKey

@Entity(tableName = "tech_notifications")
data class TechNotificationEntity(
    @PrimaryKey
    val id: String,
    val title: String,
    val message: String,
    val type: String, // emergency_call, routine, system, message
    val priority: String = "normal", // low, normal, high, urgent
    val callId: String? = null,
    val clientName: String? = null,
    val clientPhone: String? = null,
    val isRead: Boolean = false,
    val timestamp: Long = System.currentTimeMillis()
)
