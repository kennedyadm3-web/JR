package com.lefrio.atendimento.data.sync

import android.content.Context
import androidx.work.*
import com.lefrio.atendimento.data.local.AppDatabase
import com.lefrio.atendimento.util.NetworkMonitor
import java.util.concurrent.TimeUnit

/**
 * Worker do Android WorkManager para sincronização periódica e reativa em segundo plano.
 * Garante entrega 100% confiável ao servidor mesmo se o app for fechado ou a conexão oscilar.
 */
class SyncWorker(
    context: Context,
    workerParams: WorkerParameters
) : CoroutineWorker(context, workerParams) {

    override suspend fun doWork(): Result {
        if (!NetworkMonitor.hasValidatedInternet(applicationContext)) {
            return Result.retry()
        }

        val syncManager = FirebaseSyncManager(applicationContext)
        return try {
            syncManager.processPendingSyncQueue()
            val remaining = AppDatabase.getInstance(applicationContext)
                .syncQueueDao()
                .getPendingTasksCountSync()

            if (remaining > 0) {
                // Ainda restam tarefas pendentes (ex: conexão oscilou): agenda retentativa automática
                Result.retry()
            } else {
                Result.success()
            }
        } catch (e: Exception) {
            Result.retry()
        }
    }

    companion object {
        private const val PERIODIC_WORK_NAME = "LeFrioBackgroundSyncWork"
        private const val IMMEDIATE_WORK_NAME = "LeFrioImmediateSyncWork"

        fun schedulePeriodicSync(context: Context) {
            val constraints = Constraints.Builder()
                .setRequiredNetworkType(NetworkType.CONNECTED)
                .build()

            val syncRequest = PeriodicWorkRequestBuilder<SyncWorker>(15, TimeUnit.MINUTES)
                .setConstraints(constraints)
                .setBackoffCriteria(BackoffPolicy.EXPONENTIAL, 30, TimeUnit.SECONDS)
                .build()

            WorkManager.getInstance(context).enqueueUniquePeriodicWork(
                PERIODIC_WORK_NAME,
                ExistingPeriodicWorkPolicy.KEEP,
                syncRequest
            )
        }

        fun triggerImmediateSync(context: Context) {
            val constraints = Constraints.Builder()
                .setRequiredNetworkType(NetworkType.CONNECTED)
                .build()

            val oneTimeRequest = OneTimeWorkRequestBuilder<SyncWorker>()
                .setConstraints(constraints)
                .setBackoffCriteria(BackoffPolicy.EXPONENTIAL, 30, TimeUnit.SECONDS)
                .build()

            WorkManager.getInstance(context).enqueueUniqueWork(
                IMMEDIATE_WORK_NAME,
                ExistingWorkPolicy.REPLACE,
                oneTimeRequest
            )
        }
    }
}
