package com.lefrio.atendimento.data.local.entity

import androidx.room.Entity
import androidx.room.PrimaryKey

/**
 * Entidade Room local para Ordens de Serviço e Atendimentos.
 * Garante persistência instantânea no dispositivo do técnico.
 */
@Entity(tableName = "service_orders")
data class ServiceOrderEntity(
    @PrimaryKey
    val id: String,
    val osNumber: String,
    val originalId: String?,
    val clientId: String,
    val clientName: String,
    val clientDocument: String? = null,
    val addressId: String,
    val addressStreet: String,
    val addressNumber: String? = null,
    val addressCity: String? = null,
    val plannedDate: String? = null,
    val executionDate: String? = null,
    val status: String, // 'aberta', 'em_andamento', 'pre_finalizada', 'finalizada', 'cancelada'
    val type: String, // 'MANUTENCAO CORRETIVA CONTRATO', 'MANUTENCAO PREVENTIVA', etc.
    val technician1: String,
    val technician2: String? = null,
    val clientRepresentative: String? = null,
    val clientSigneeDoc: String? = null,
    val clientSignatureDate: String? = null,
    val clientSignaturePath: String? = null, // Caminho local do arquivo da assinatura gravado no aparelho
    val completionDate: String? = null,
    val completionLatitude: Double? = null,
    val completionLongitude: Double? = null,
    val completionAccuracy: Float? = null,
    val generalNotes: String? = null,
    val isLockedForEdit: Boolean = false,
    val isSyncedWithServer: Boolean = false,
    val lastModifiedAt: Long = System.currentTimeMillis()
)
