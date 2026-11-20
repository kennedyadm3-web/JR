package com.lefrio.atendimento.util

import android.content.Context
import android.net.ConnectivityManager
import android.net.Network
import android.net.NetworkCapabilities
import android.net.NetworkRequest
import kotlinx.coroutines.channels.awaitClose
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.callbackFlow
import kotlinx.coroutines.flow.distinctUntilChanged

class NetworkMonitor(private val context: Context) {

    private val connectivityManager =
        context.getSystemService(Context.CONNECTIVITY_SERVICE) as ConnectivityManager

    companion object {
        /**
         * Verifica se há conectividade real e validada com a internet (evita falso positivo em Wi-Fi sem internet ou 3G morto).
         */
        fun hasValidatedInternet(context: Context): Boolean {
            return try {
                val cm = context.getSystemService(Context.CONNECTIVITY_SERVICE) as ConnectivityManager
                val activeNetwork = cm.activeNetwork ?: return false
                val caps = cm.getNetworkCapabilities(activeNetwork) ?: return false
                val hasInternet = caps.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET)
                val isValidated = caps.hasCapability(NetworkCapabilities.NET_CAPABILITY_VALIDATED)
                hasInternet && isValidated
            } catch (_: Exception) {
                false
            }
        }
    }

    val isOnline: Flow<Boolean> = callbackFlow {
        val callback = object : ConnectivityManager.NetworkCallback() {
            override fun onAvailable(network: Network) {
                trySend(hasValidatedInternet(context))
            }

            override fun onCapabilitiesChanged(network: Network, networkCapabilities: NetworkCapabilities) {
                val validated = networkCapabilities.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET) &&
                    networkCapabilities.hasCapability(NetworkCapabilities.NET_CAPABILITY_VALIDATED)
                trySend(validated)
            }

            override fun onLost(network: Network) {
                trySend(hasValidatedInternet(context))
            }
        }

        val request = NetworkRequest.Builder()
            .addCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET)
            .build()

        try {
            connectivityManager.registerNetworkCallback(request, callback)
        } catch (_: Exception) {}

        // Estado inicial validado
        trySend(hasValidatedInternet(context))

        awaitClose {
            try {
                connectivityManager.unregisterNetworkCallback(callback)
            } catch (_: Exception) {}
        }
    }.distinctUntilChanged()
}
