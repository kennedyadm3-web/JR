package com.lefrio.atendimento.data.local

import android.content.Context
import androidx.room.Database
import androidx.room.Room
import androidx.room.RoomDatabase
import com.lefrio.atendimento.data.local.dao.EquipmentChecklistDao
import com.lefrio.atendimento.data.local.dao.RouteExpenseDao
import com.lefrio.atendimento.data.local.dao.ServiceOrderDao
import com.lefrio.atendimento.data.local.dao.SyncQueueDao
import com.lefrio.atendimento.data.local.dao.TechNotificationDao
import com.lefrio.atendimento.data.local.entity.EquipmentChecklistEntity
import com.lefrio.atendimento.data.local.entity.RouteExpenseEntity
import com.lefrio.atendimento.data.local.entity.ServiceOrderEntity
import com.lefrio.atendimento.data.local.entity.SyncQueueEntity
import com.lefrio.atendimento.data.local.entity.TechNotificationEntity

@Database(
    entities = [
        ServiceOrderEntity::class,
        EquipmentChecklistEntity::class,
        SyncQueueEntity::class,
        RouteExpenseEntity::class,
        TechNotificationEntity::class
    ],
    version = 3,
    exportSchema = true
)
abstract class AppDatabase : RoomDatabase() {

    abstract fun serviceOrderDao(): ServiceOrderDao
    abstract fun equipmentChecklistDao(): EquipmentChecklistDao
    abstract fun syncQueueDao(): SyncQueueDao
    abstract fun routeExpenseDao(): RouteExpenseDao
    abstract fun techNotificationDao(): TechNotificationDao

    companion object {
        @Volatile
        private var INSTANCE: AppDatabase? = null

        fun getInstance(context: Context): AppDatabase {
            return INSTANCE ?: synchronized(this) {
                val instance = Room.databaseBuilder(
                    context.applicationContext,
                    AppDatabase::class.java,
                    "lefrio_atendimento.db"
                )
                    .fallbackToDestructiveMigration()
                    .build()
                INSTANCE = instance
                instance
            }
        }
    }
}
