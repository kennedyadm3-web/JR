package com.lefrio.atendimento.data.sync

import android.content.Context
import android.net.ConnectivityManager
import android.net.Network
import android.net.NetworkCapabilities
import android.net.NetworkRequest
import android.util.Log
import com.lefrio.atendimento.data.auth.AuthRepository
import com.lefrio.atendimento.data.repository.ServiceOrderRepository
import com.lefrio.atendimento.util.NetworkMonitor
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch

/**
 * Monitor contínuo e automático de conectividade de rede.
 * Garante que assim que houver sinal de internet REAL E VALIDADO (Wi-Fi ou 4G/5G),
 * toda a fila offline pendente seja entregue ao servidor automaticamente sem exigir ação manual.
 */
class NetworkConnectivityMonitor(private val context: Context) {

    private val connectivityManager =
        context.getSystemService(Context.CONNECTIVITY_SERVICE) as ConnectivityManager

    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
    private val syncManager = FirebaseSyncManager(context)
    private val orderRepository = ServiceOrderRepository(context)
    private val authRepository = AuthRepository(context)
    private val TAG = "ConnectivityMonitor"

    @Volatile
    private var wasValidatedOnline = false

    fun startMonitoring() {
        try {
            wasValidatedOnline = NetworkMonitor.hasValidatedInternet(context)
            val request = NetworkRequest.Builder()
                .addCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET)
                .build()

            connectivityManager.registerNetworkCallback(request, object : ConnectivityManager.NetworkCallback() {
                override fun onAvailable(network: Network) {
                    if (NetworkMonitor.hasValidatedInternet(context) && !wasValidatedOnline) {
                        Log.d(TAG, "Internet validada restabelecida (onAvailable). Disparando sincronização automática...")
                        wasValidatedOnline = true
                        triggerAutoSync()
                    }
                }

                override fun onCapabilitiesChanged(network: Network, networkCapabilities: NetworkCapabilities) {
                    val validated = networkCapabilities.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET) &&
                        networkCapabilities.hasCapability(NetworkCapabilities.NET_CAPABILITY_VALIDATED)
                    if (validated && !wasValidatedOnline) {
                        Log.d(TAG, "Internet validada restabelecida (onCapabilitiesChanged). Disparando sincronização automática...")
                        wasValidatedOnline = true
                        triggerAutoSync()
                    } else if (!validated) {
                        wasValidatedOnline = false
                    }
                }

                override fun onLost(network: Network) {
                    if (!NetworkMonitor.hasValidatedInternet(context)) {
                        Log.d(TAG, "Conexão com a Internet perdida. Modo offline ativo.")
                        wasValidatedOnline = false
                    }
                }
            })
        } catch (e: Exception) {
            Log.e(TAG, "Erro ao registrar monitor de conectividade: ${e.message}", e)
        }
    }

    /**
     * Sincroniza automaticamente a fila de envios pendentes e só depois reconcilia o roteiro do técnico logado.
     */
    fun triggerAutoSync() {
        // Agenda também via WorkManager para sobreviver se o app for fechado durante o envio
        SyncWorker.triggerImmediateSync(context)

        scope.launch {
            try {
                if (!NetworkMonitor.hasValidatedInternet(context)) return@launch

                // 1. Processa fila de alterações locais para envio (protegido por Mutex)
                syncManager.processPendingSyncQueue()

                // 2. Sincroniza o roteiro do técnico autenticado na sessão ativa
                val currentTech = authRepository.getSelectedTechnician()
                if (currentTech != null && currentTech.name.isNotBlank()) {
                    Log.d(TAG, "Sincronizando itinerário automaticamente para ${currentTech.name}...")
                    orderRepository.syncDailyItinerary(
                        technicianName = currentTech.name,
                        technicianId = currentTech.uid
                    )
                }
            } catch (e: Exception) {
                Log.w(TAG, "Falha na sincronização automática em segundo plano: ${e.message}")
            }
        }
    }
}
