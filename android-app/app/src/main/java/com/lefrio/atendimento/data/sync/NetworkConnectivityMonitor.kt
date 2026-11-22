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
import com.lefrio.atendimento.util.PhotoCaptureManager
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch

/**
 * Coordenador Único de Conectividade (Modelo Híbrido Inteligente).
 * - Aguarda 5 segundos de sinal 4G/Wi-Fi validado e estável (debounce) antes de disparar sincronização.
 * - Cancela disparos pendentes caso o sinal oscile em áreas de sombra/elevadores/túneis.
 * - Sempre esvazia primeiro a fila compactada de envios e só depois executa Pull controlado do roteiro.
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
    private var reconnectSyncJob: Job? = null

    companion object {
        private const val RECONNECT_STABILITY_DEBOUNCE_MS = 5_000L
    }

    fun startMonitoring() {
        try {
            wasValidatedOnline = NetworkMonitor.hasValidatedInternet(context)
            val request = NetworkRequest.Builder()
                .addCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET)
                .build()

            connectivityManager.registerNetworkCallback(request, object : ConnectivityManager.NetworkCallback() {
                override fun onAvailable(network: Network) {
                    if (NetworkMonitor.hasValidatedInternet(context) && !wasValidatedOnline) {
                        wasValidatedOnline = true
                        scheduleStableReconnectSync("onAvailable")
                    }
                }

                override fun onCapabilitiesChanged(network: Network, networkCapabilities: NetworkCapabilities) {
                    val validated = networkCapabilities.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET) &&
                        networkCapabilities.hasCapability(NetworkCapabilities.NET_CAPABILITY_VALIDATED)
                    if (validated && !wasValidatedOnline) {
                        wasValidatedOnline = true
                        scheduleStableReconnectSync("onCapabilitiesChanged")
                    } else if (!validated) {
                        wasValidatedOnline = false
                        reconnectSyncJob?.cancel()
                    }
                }

                override fun onLost(network: Network) {
                    if (!NetworkMonitor.hasValidatedInternet(context)) {
                        Log.d(TAG, "Conexão com a Internet perdida. Modo offline ativo.")
                        wasValidatedOnline = false
                        reconnectSyncJob?.cancel()
                    }
                }
            })
        } catch (e: Exception) {
            Log.e(TAG, "Erro ao registrar monitor de conectividade: ${e.message}", e)
        }
    }

    /**
     * Aguarda 5 segundos de conexão validada contínua para evitar rajadas em áreas de sinal instável.
     */
    private fun scheduleStableReconnectSync(source: String) {
        reconnectSyncJob?.cancel()
        reconnectSyncJob = scope.launch {
            Log.d(TAG, "Sinal restabelecido ($source). Aguardando ${RECONNECT_STABILITY_DEBOUNCE_MS / 1000}s de estabilidade 4G...")
            delay(RECONNECT_STABILITY_DEBOUNCE_MS)

            if (!NetworkMonitor.hasValidatedInternet(context)) {
                Log.d(TAG, "Sinal oscilou durante janela de estabilização. Sincronização adiada.")
                wasValidatedOnline = false
                return@launch
            }

            triggerAutoSync()
        }
    }

    /**
     * Sincroniza automaticamente a fila compactada de envios e só depois faz Pull controlado do roteiro.
     */
    fun triggerAutoSync() {
        // Backup via WorkManager (política KEEP) para sobreviver se o app for fechado durante o envio
        SyncWorker.triggerImmediateSync(context)

        scope.launch {
            try {
                if (!NetworkMonitor.hasValidatedInternet(context)) return@launch

                // 1. Esvazia fila local compactada e cadenciada (protegida por Mutex)
                syncManager.processPendingSyncQueue(ignoreBackoff = false)

                // 2. Pull controlado do roteiro (protegido por Mutex + Cooldown de 3 min)
                val currentTech = authRepository.getSelectedTechnician()
                if (currentTech != null && currentTech.name.isNotBlank()) {
                    Log.d(TAG, "Executando Pull controlado do roteiro para ${currentTech.name}...")
                    orderRepository.syncDailyItinerary(
                        technicianName = currentTech.name,
                        technicianId = currentTech.uid,
                        forceRefresh = false
                    )
                }

                // 3. Limpeza diária de mídia sincronizada há mais de 7 dias (gate de 24h)
                PhotoCaptureManager.cleanupOldSyncedMediaIfDue(context)
            } catch (e: Exception) {
                Log.w(TAG, "Falha na sincronização automática em segundo plano: ${e.message}")
            }
        }
    }
}
