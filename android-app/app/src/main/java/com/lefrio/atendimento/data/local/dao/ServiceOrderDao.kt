package com.lefrio.atendimento.data.local.dao

import androidx.room.*
import com.lefrio.atendimento.data.local.entity.ServiceOrderEntity
import kotlinx.coroutines.flow.Flow

@Dao
interface ServiceOrderDao {

    @Query("SELECT * FROM service_orders ORDER BY plannedDate ASC, lastModifiedAt DESC")
    fun getAllOrdersFlow(): Flow<List<ServiceOrderEntity>>

    @Query("SELECT * FROM service_orders ORDER BY plannedDate ASC, lastModifiedAt DESC")
    suspend fun getAllOrders(): List<ServiceOrderEntity>

    @Query("SELECT * FROM service_orders WHERE id = :orderId LIMIT 1")
    suspend fun getOrderById(orderId: String): ServiceOrderEntity?

    @Query("SELECT * FROM service_orders WHERE id = :orderId LIMIT 1")
    fun getOrderByIdFlow(orderId: String): Flow<ServiceOrderEntity?>

    @Query("SELECT * FROM service_orders WHERE status = :status ORDER BY plannedDate ASC")
    fun getOrdersByStatusFlow(status: String): Flow<List<ServiceOrderEntity>>

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insertOrUpdate(order: ServiceOrderEntity)

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insertAll(orders: List<ServiceOrderEntity>)

    @Query("UPDATE service_orders SET status = :status, isSyncedWithServer = 0, lastModifiedAt = :timestamp WHERE id = :orderId")
    suspend fun updateStatus(orderId: String, status: String, timestamp: Long = System.currentTimeMillis())

    @Query("""
        UPDATE service_orders SET 
            clientRepresentative = :fiscalName,
            clientSigneeDoc = :fiscalDoc,
            lastModifiedAt = :timestamp
        WHERE id = :orderId
    """)
    suspend fun updateFiscalDraft(
        orderId: String,
        fiscalName: String,
        fiscalDoc: String,
        timestamp: Long = System.currentTimeMillis()
    )

    @Query("""
        UPDATE service_orders SET 
            clientRepresentative = :signeeName,
            clientSigneeDoc = :signeeDoc,
            clientSignatureDate = :signatureDate,
            clientSignaturePath = :signaturePath,
            completionDate = :completionDate,
            completionLatitude = :latitude,
            completionLongitude = :longitude,
            completionAccuracy = :accuracy,
            status = 'finalizada',
            isLockedForEdit = 1,
            isSyncedWithServer = 0,
            lastModifiedAt = :timestamp
        WHERE id = :orderId
    """)
    suspend fun finalizeOrderWithSignature(
        orderId: String,
        signeeName: String,
        signeeDoc: String,
        signatureDate: String,
        signaturePath: String,
        completionDate: String,
        latitude: Double,
        longitude: Double,
        accuracy: Float,
        timestamp: Long = System.currentTimeMillis()
    )

    @Query("UPDATE service_orders SET isSyncedWithServer = 1 WHERE id = :orderId")
    suspend fun markAsSynced(orderId: String)

    @Query("""
        SELECT * FROM service_orders 
        WHERE type != 'MANUTENÇÃO PREVENTIVA' 
          AND id NOT LIKE 'PREV_%'
          AND (plannedDate = :date OR plannedDate LIKE :date || '%' OR plannedDate LIKE '%' || :date || '%')
          AND (
            UPPER(technician1) LIKE '%' || UPPER(:technicianName) || '%'
            OR UPPER(technician1) = UPPER(:technicianId)
            OR UPPER(technician2) LIKE '%' || UPPER(:technicianName) || '%'
            OR UPPER(technician2) = UPPER(:technicianId)
          )
          AND clientName NOT IN ('', 'Cliente LeFrio', 'Cliente PMOC', 'Cliente Teste')
          AND addressStreet NOT IN ('', 'Endereço do Chamado', 'Endereço Teste')
        ORDER BY lastModifiedAt DESC, osNumber ASC
    """)
    fun getServiceOrdersForTechnicianAndDateFlow(
        technicianName: String,
        technicianId: String,
        date: String
    ): Flow<List<ServiceOrderEntity>>

    @Query("""
        SELECT DISTINCT 
            CASE WHEN clientId IS NULL OR clientId = '' THEN addressId ELSE clientId END AS clientId,
            CASE WHEN clientName IS NULL OR clientName = '' OR clientName IN ('Cliente LeFrio', 'Cliente PMOC') THEN addressStreet ELSE clientName END AS clientName,
            clientSigneeDoc AS clientDocument, 
            addressId, 
            addressStreet, 
            addressCity
        FROM service_orders 
        WHERE (plannedDate = :date OR plannedDate LIKE :date || '%' OR plannedDate LIKE '%' || :date || '%')
          AND (
            :technicianName = '' 
            OR UPPER(technician1) LIKE '%' || UPPER(:technicianName) || '%'
            OR UPPER(technician1) = UPPER(:technicianId)
            OR UPPER(technician2) LIKE '%' || UPPER(:technicianName) || '%'
            OR UPPER(technician2) = UPPER(:technicianId)
          )
          AND addressStreet NOT IN ('', 'Endereço Teste')
          AND addressId != ''
        ORDER BY clientName ASC, addressStreet ASC
    """)
    suspend fun getScheduledLocationsForTechnicianAndDate(
        technicianName: String,
        technicianId: String,
        date: String
    ): List<ScheduledLocationTuple>

    @Query("""
        SELECT DISTINCT 
            CASE WHEN clientId IS NULL OR clientId = '' THEN addressId ELSE clientId END AS clientId,
            CASE WHEN clientName IS NULL OR clientName = '' OR clientName IN ('Cliente LeFrio', 'Cliente PMOC') THEN addressStreet ELSE clientName END AS clientName,
            clientSigneeDoc AS clientDocument, 
            addressId, 
            addressStreet, 
            addressCity
        FROM service_orders 
        WHERE (plannedDate = :date OR plannedDate LIKE :date || '%' OR plannedDate LIKE '%' || :date || '%')
          AND addressStreet NOT IN ('', 'Endereço Teste')
          AND addressId != ''
        ORDER BY clientName ASC, addressStreet ASC
    """)
    suspend fun getScheduledLocationsForDateOnly(
        date: String
    ): List<ScheduledLocationTuple>

    @Query("""
        SELECT DISTINCT 
            CASE WHEN clientId IS NULL OR clientId = '' THEN addressId ELSE clientId END AS clientId,
            CASE WHEN clientName IS NULL OR clientName = '' OR clientName IN ('Cliente LeFrio', 'Cliente PMOC') THEN addressStreet ELSE clientName END AS clientName,
            clientSigneeDoc AS clientDocument, 
            addressId, 
            addressStreet, 
            addressCity
        FROM service_orders 
        WHERE (
            :technicianName = '' 
            OR UPPER(technician1) LIKE '%' || UPPER(:technicianName) || '%'
            OR UPPER(technician1) = UPPER(:technicianId)
            OR UPPER(technician2) LIKE '%' || UPPER(:technicianName) || '%'
            OR UPPER(technician2) = UPPER(:technicianId)
          )
          AND addressStreet NOT IN ('', 'Endereço Teste')
          AND addressId != ''
        ORDER BY clientName ASC, addressStreet ASC
    """)
    suspend fun getAllLocationsForTechnician(
        technicianName: String,
        technicianId: String
    ): List<ScheduledLocationTuple>

    @Query("""
        SELECT DISTINCT 
            CASE WHEN clientId IS NULL OR clientId = '' THEN addressId ELSE clientId END AS clientId,
            CASE WHEN clientName IS NULL OR clientName = '' OR clientName IN ('Cliente LeFrio', 'Cliente PMOC') THEN addressStreet ELSE clientName END AS clientName,
            clientSigneeDoc AS clientDocument, 
            addressId, 
            addressStreet, 
            addressCity
        FROM service_orders 
        WHERE addressStreet NOT IN ('', 'Endereço Teste')
          AND addressId != ''
        ORDER BY clientName ASC, addressStreet ASC
    """)
    suspend fun getAllValidLocations(): List<ScheduledLocationTuple>

    @Query("""
        DELETE FROM service_orders 
        WHERE id IN ('PREV_CORREIOS_ANADIA', 'PREV_BB_CENTRO', 'OS_CORRETIVA_1042', 'PREV_HOSPITAL_METRO', 'OS_CORRETIVA_1055')
           OR osNumber IN ('PMOC-101', 'PMOC-102', '1042', 'PMOC-103', '1055')
           OR clientName IN ('BANCO DO BRASIL - AGÊNCIA 0058', 'TRIBUNAL DE JUSTIÇA - ANEXO II', 'CORREIOS - AGÊNCIA ANADIA', 'HOSPITAL METROPOLITANO - ALA SUL', 'SEDUC - CENTRO DE FORMAÇÃO')
    """)
    suspend fun deleteInvalidAndFakeOrders()

    @Query("""
        DELETE FROM service_orders 
        WHERE id IN ('PREV_CORREIOS_ANADIA', 'PREV_BB_CENTRO', 'OS_CORRETIVA_1042', 'PREV_HOSPITAL_METRO', 'OS_CORRETIVA_1055')
           OR osNumber IN ('PMOC-101', 'PMOC-102', '1042', 'PMOC-103', '1055')
           OR clientName IN ('BANCO DO BRASIL - AGÊNCIA 0058', 'TRIBUNAL DE JUSTIÇA - ANEXO II', 'CORREIOS - AGÊNCIA ANADIA', 'HOSPITAL METROPOLITANO - ALA SUL', 'SEDUC - CENTRO DE FORMAÇÃO')
    """)
    suspend fun deleteFakeSeedOrders()
}

data class ScheduledLocationTuple(
    val clientId: String,
    val clientName: String,
    val clientDocument: String? = null,
    val addressId: String,
    val addressStreet: String,
    val addressCity: String? = null
)
