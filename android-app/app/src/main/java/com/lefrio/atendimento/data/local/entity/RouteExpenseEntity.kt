package com.lefrio.atendimento.data.local.entity

import androidx.room.Entity
import androidx.room.PrimaryKey

@Entity(tableName = "route_expenses")
data class RouteExpenseEntity(
    @PrimaryKey
    val id: String,
    val technicianId: String,
    val technicianName: String,
    val category: String, // combustivel, pedagio, alimentacao, hospedagem, material, outros
    val amount: Double,
    val description: String,
    val date: String,
    val receiptLocalPhotoPath: String? = null,
    val orderId: String? = null,
    val status: String = "pendente", // pendente, aprovado, recusado
    val isSynced: Boolean = false,
    val createdAt: Long = System.currentTimeMillis()
)
