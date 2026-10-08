package com.lefrio.atendimento.data.local.dao

import androidx.room.*
import com.lefrio.atendimento.data.local.entity.TechnicianEntity
import kotlinx.coroutines.flow.Flow

@Dao
interface TechnicianDao {

    @Query("SELECT * FROM technicians ORDER BY name ASC")
    fun getAllTechnicians(): Flow<List<TechnicianEntity>>

    @Query("SELECT * FROM technicians WHERE active = 1 ORDER BY name ASC")
    suspend fun getActiveTechniciansSync(): List<TechnicianEntity>

    @Query("SELECT * FROM technicians WHERE id = :id LIMIT 1")
    suspend fun getTechnicianById(id: String): TechnicianEntity?

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insertAll(technicians: List<TechnicianEntity>)

    @Query("DELETE FROM technicians")
    suspend fun clearAll()
}
