package com.lefrio.atendimento

import android.app.Application
import com.google.firebase.FirebaseApp
import com.lefrio.atendimento.data.local.AppDatabase
import com.lefrio.atendimento.data.sync.NetworkConnectivityMonitor
import com.lefrio.atendimento.data.sync.SyncWorker
import com.lefrio.atendimento.util.NetworkMonitor

class LeFrioApplication : Application() {

    lateinit var database: AppDatabase
        private set

    private lateinit var connectivityMonitor: NetworkConnectivityMonitor

    override fun onCreate() {
        super.onCreate()

        // 1. Inicializa o Firebase
        FirebaseApp.initializeApp(this)

        // 2. Inicializa o banco de dados local Room (Offline-First)
        database = AppDatabase.getInstance(this)

        // 3. Agenda a rotina de sincronização em segundo plano via WorkManager
        SyncWorker.schedulePeriodicSync(this)

        // 4. Se já houver internet validada na abertura do app, garante o envio imediato de pendências offline
        if (NetworkMonitor.hasValidatedInternet(this)) {
            SyncWorker.triggerImmediateSync(this)
        }

        // 5. Inicia monitoramento de rede para sincronização automática quando houver internet estável
        connectivityMonitor = NetworkConnectivityMonitor(this)
        connectivityMonitor.startMonitoring()
    }
}
