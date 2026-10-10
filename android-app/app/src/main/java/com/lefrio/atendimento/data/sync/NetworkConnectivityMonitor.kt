package com.lefrio.atendimento.data.sync

import android.content.Context
import android.net.ConnectivityManager
import android.net.Network
import android.net.NetworkCapabilities
import android.net.NetworkRequest
import android.util.Log
import com.lefrio.atendimento.data.auth.AuthRepository
import com.lefrio.atendimento.data.repository.ServiceOrderRepository
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch

/**
 * Monitor contínuo e automático de conectividade de rede.
 * Garante que assim que houver sinal de internet (Wi-Fi ou 4G/5G) e o sistema estiver online,
 * a sincronização com a nuvem seja disparada imediatamente sem exigir ação manual.
 */
class NetworkConnectivityMonitor(private val context: Context) {

    private val connectivityManager =
        context.getSystemService(Context.CONNECTIVITY_SERVICE) as ConnectivityManager

    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
    private val syncManager = FirebaseSyncManager(context)
    private val orderRepository = ServiceOrderRepository(context)
    private val authRepository = AuthRepository(context)
    private val TAG = "ConnectivityMonitor"

    private var isNetworkAvailable = false

    fun startMonitoring() {
        try {
            val request = NetworkRequest.Builder()
                .addCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET)
                .build()

            connectivityManager.registerNetworkCallback(request, object : ConnectivityManager.NetworkCallback() {
                override fun onAvailable(network: Network) {
                    Log.d(TAG, "Conexão com a Internet restabelecida. Disparando sincronização automática...")
                    isNetworkAvailable = true
                    triggerAutoSync()
                }

                override fun onLost(network: Network) {
                    Log.d(TAG, "Conexão com a Internet perdida. Modo offline ativo.")
                    isNetworkAvailable = false
                }
            })
        } catch (e: Exception) {
            Log.e(TAG, "Erro ao registrar monitor de conectividade: ${e.message}", e)
        }
    }

    /**
     * Sincroniza automaticamente a fila de envios pendentes e baixa os dados do técnico logado.
     */
    fun triggerAutoSync() {
        scope.launch {
            try {
                // 1. Processa fila de alterações locais para envio
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
