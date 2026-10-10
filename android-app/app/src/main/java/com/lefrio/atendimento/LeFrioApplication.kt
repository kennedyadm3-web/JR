package com.lefrio.atendimento

import android.app.Application
import com.google.firebase.FirebaseApp
import com.lefrio.atendimento.data.local.AppDatabase
import com.lefrio.atendimento.data.sync.SyncWorker

class LeFrioApplication : Application() {

    lateinit var database: AppDatabase
        private set

    override fun onCreate() {
        super.onCreate()

        // 1. Inicializa o Firebase
        FirebaseApp.initializeApp(this)

        // 2. Inicializa o banco de dados local Room (Offline-First)
        database = AppDatabase.getInstance(this)

        // 3. Agenda a rotina de sincronização em segundo plano via WorkManager
        SyncWorker.schedulePeriodicSync(this)

        // 4. Inicia monitoramento de rede para sincronização automática quando houver internet
        val connectivityMonitor = com.lefrio.atendimento.data.sync.NetworkConnectivityMonitor(this)
        connectivityMonitor.startMonitoring()
    }
}
