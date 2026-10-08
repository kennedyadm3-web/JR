package com.lefrio.atendimento.data.local.entity

import androidx.room.Entity
import androidx.room.ForeignKey
import androidx.room.Index
import androidx.room.PrimaryKey

/**
 * Entidade Room local para itens do Checklist técnico de cada máquina.
 * Garante que cada item verificado, fotos tiradas e observações fiquem gravados
 * imediatamente na memória local do smartphone.
 */
@Entity(
    tableName = "equipment_checklists",
    foreignKeys = [
        ForeignKey(
            entity = ServiceOrderEntity::class,
            parentColumns = ["id"],
            childColumns = ["orderId"],
            onDelete = ForeignKey.CASCADE
        )
    ],
    indices = [Index(value = ["orderId", "equipmentId"])]
)
data class EquipmentChecklistEntity(
    @PrimaryKey
    val id: String, // UUID único do registro de checklist
    val orderId: String,
    val equipmentId: String,
    val equipmentName: String,
    val equipmentBrand: String? = null,
    val equipmentBtus: String? = null,
    val equipmentSector: String? = null,
    val equipmentPatrimony: String? = null,
    val isChecked: Boolean = false,
    val isSkipped: Boolean = false,
    val notes: String = "",
    val justification: String? = null,
    val checkedAt: String? = null,
    val localPhotoPathsJson: String = "[]", // Lista serializada de caminhos locais das fotos no celular
    val remotePhotoUrlsJson: String = "[]", // URLs de upload no Firebase Storage
    val isSynced: Boolean = false,
    val updatedAt: Long = System.currentTimeMillis()
)
