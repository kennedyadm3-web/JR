package com.lefrio.atendimento.data.local.dao

import androidx.room.*
import com.lefrio.atendimento.data.local.entity.RouteExpenseEntity
import kotlinx.coroutines.flow.Flow

@Dao
interface RouteExpenseDao {

    @Query("SELECT * FROM route_expenses ORDER BY createdAt DESC")
    fun getAllExpenses(): Flow<List<RouteExpenseEntity>>

    @Query("SELECT * FROM route_expenses WHERE technicianId = :techId ORDER BY createdAt DESC")
    fun getExpensesByTechnician(techId: String): Flow<List<RouteExpenseEntity>>

    @Query("SELECT SUM(amount) FROM route_expenses WHERE technicianId = :techId")
    fun getTotalExpensesByTechnician(techId: String): Flow<Double?>

    @Query("SELECT * FROM route_expenses WHERE isSynced = 0")
    suspend fun getUnsyncedExpenses(): List<RouteExpenseEntity>

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insertExpense(expense: RouteExpenseEntity)

    @Query("UPDATE route_expenses SET isSynced = 1 WHERE id = :id")
    suspend fun markAsSynced(id: String)

    @Query("DELETE FROM route_expenses WHERE id = :id")
    suspend fun deleteExpense(id: String)
}
