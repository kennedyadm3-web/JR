package com.lefrio.atendimento

import android.app.Application
import com.google.firebase.FirebaseApp
import com.lefrio.atendimento.data.local.AppDatabase
import com.lefrio.atendimento.data.sync.NetworkConnectivityMonitor
import com.lefrio.atendimento.data.sync.SyncWorker
import com.lefrio.atendimento.util.NetworkMonitor
import com.lefrio.atendimento.util.PhotoCaptureManager
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch

class LeFrioApplication : Application() {

    lateinit var database: AppDatabase
        private set

    private lateinit var connectivityMonitor: NetworkConnectivityMonitor
    private val appScope = CoroutineScope(SupervisorJob() + Dispatchers.IO)

    override fun onCreate() {
        super.onCreate()

        // 1. Inicializa o Firebase
        FirebaseApp.initializeApp(this)

        // 2. Inicializa o banco de dados local Room (Offline-First)
        database = AppDatabase.getInstance(this)

        // 3. Agenda a rotina de sincronização periódica em segundo plano via WorkManager
        SyncWorker.schedulePeriodicSync(this)

        // 4. Se já houver internet validada na abertura do app, garante o envio de pendências offline via política KEEP
        if (NetworkMonitor.hasValidatedInternet(this)) {
            SyncWorker.triggerImmediateSync(this)
        }

        // 5. Inicia coordenador único de rede (com debounce de 5s de estabilidade 4G)
        connectivityMonitor = NetworkConnectivityMonitor(this)
        connectivityMonitor.startMonitoring()

        // 6. Rotina leve de higiene de disco em background (limpa mídia já sincronizada há mais de 7 dias, no máx. 1x/24h)
        appScope.launch {
            PhotoCaptureManager.cleanupOldSyncedMediaIfDue(this@LeFrioApplication)
        }
    }
}
