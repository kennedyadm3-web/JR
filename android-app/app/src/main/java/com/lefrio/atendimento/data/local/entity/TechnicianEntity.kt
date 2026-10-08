package com.lefrio.atendimento.data.local.entity

import androidx.room.Entity
import androidx.room.PrimaryKey

@Entity(tableName = "technicians")
data class TechnicianEntity(
    @PrimaryKey
    val id: String,
    val name: String,
    val pin: String = "",
    val email: String? = null,
    val phone: String? = null,
    val active: Boolean = true
)
