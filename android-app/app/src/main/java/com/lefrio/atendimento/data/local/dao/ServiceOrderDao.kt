package com.lefrio.atendimento.data.local.dao

import androidx.room.*
import com.lefrio.atendimento.data.local.entity.ServiceOrderEntity
import kotlinx.coroutines.flow.Flow

@Dao
interface ServiceOrderDao {

    @Query("SELECT * FROM service_orders ORDER BY plannedDate ASC, lastModifiedAt DESC")
    fun getAllOrdersFlow(): Flow<List<ServiceOrderEntity>>

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
}
