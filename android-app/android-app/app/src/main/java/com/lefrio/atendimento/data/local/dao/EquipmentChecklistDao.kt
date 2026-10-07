package com.lefrio.atendimento.data.local.dao

import androidx.room.*
import com.lefrio.atendimento.data.local.entity.EquipmentChecklistEntity
import kotlinx.coroutines.flow.Flow

@Dao
interface EquipmentChecklistDao {

    @Query("SELECT * FROM equipment_checklists WHERE orderId = :orderId ORDER BY equipmentName ASC")
    fun getChecklistForOrderFlow(orderId: String): Flow<List<EquipmentChecklistEntity>>

    @Query("SELECT * FROM equipment_checklists WHERE orderId = :orderId")
    suspend fun getChecklistForOrder(orderId: String): List<EquipmentChecklistEntity>

    @Query("SELECT * FROM equipment_checklists WHERE id = :id LIMIT 1")
    suspend fun getChecklistById(id: String): EquipmentChecklistEntity?

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insertOrUpdate(item: EquipmentChecklistEntity)

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insertAll(items: List<EquipmentChecklistEntity>)

    @Query("""
        UPDATE equipment_checklists SET 
            isChecked = :isChecked,
            isSkipped = :isSkipped,
            notes = :notes,
            justification = :justification,
            checkedAt = :checkedAt,
            localPhotoPathsJson = :localPhotoPathsJson,
            isSynced = 0,
            updatedAt = :timestamp
        WHERE id = :id
    """)
    suspend fun updateChecklistExecution(
        id: String,
        isChecked: Boolean,
        isSkipped: Boolean,
        notes: String,
        justification: String?,
        checkedAt: String?,
        localPhotoPathsJson: String,
        timestamp: Long = System.currentTimeMillis()
    )

    @Query("UPDATE equipment_checklists SET remotePhotoUrlsJson = :remoteUrlsJson, isSynced = 1 WHERE id = :id")
    suspend fun markPhotosUploaded(id: String, remoteUrlsJson: String)
}
