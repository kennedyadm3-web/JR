package com.lefrio.atendimento.data.sync

import android.content.Context
import androidx.work.*
import com.lefrio.atendimento.data.local.AppDatabase
import com.lefrio.atendimento.util.NetworkMonitor
import com.lefrio.atendimento.util.PhotoCaptureManager
import java.util.concurrent.TimeUnit

/**
 * Worker do Android WorkManager para sincronização em segundo plano (Modelo Híbrido Inteligente).
 * - Política KEEP evita cancelar envios 4G já em progresso.
 * - Executa até 3 passadas caso novas pendências cheguem enquanto um lote está sendo enviado.
 * - Aciona rotina diária de limpeza de fotos sincronizadas há mais de 7 dias.
 */
class SyncWorker(
    context: Context,
    workerParams: WorkerParameters
) : CoroutineWorker(context, workerParams) {

    override suspend fun doWork(): Result {
        // Limpeza segura de mídia local já sincronizada há mais de 7 dias (executada no máximo 1x a cada 24h)
        try {
            PhotoCaptureManager.cleanupOldSyncedMediaIfDue(applicationContext)
        } catch (_: Exception) {}

        if (!NetworkMonitor.hasValidatedInternet(applicationContext)) {
            return Result.retry()
        }

        val syncManager = FirebaseSyncManager(applicationContext)
        val syncDao = AppDatabase.getInstance(applicationContext).syncQueueDao()

        return try {
            var pass = 0
            while (pass < 3) {
                val synced = syncManager.processPendingSyncQueue(ignoreBackoff = false)
                val remaining = syncDao.getPendingTasksCountSync()
                if (remaining == 0 || synced == 0) {
                    break
                }
                pass++
            }

            val finalRemaining = syncDao.getPendingTasksCountSync()
            if (finalRemaining > 0) {
                // Ainda existem tarefas aguardando backoff ou rede estável: agenda retentativa automática
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

            // KEEP impede que uma nova ação do técnico aborte um upload 4G que já estava em andamento
            WorkManager.getInstance(context).enqueueUniqueWork(
                IMMEDIATE_WORK_NAME,
                ExistingWorkPolicy.KEEP,
                oneTimeRequest
            )
        }
    }
}
