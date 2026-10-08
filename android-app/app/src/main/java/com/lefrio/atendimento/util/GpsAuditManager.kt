package com.lefrio.atendimento.util

import android.annotation.SuppressLint
import android.content.Context
import android.location.Location
import com.google.android.gms.location.FusedLocationProviderClient
import com.google.android.gms.location.LocationServices
import com.google.android.gms.location.Priority
import com.google.android.gms.tasks.CancellationTokenSource
import kotlinx.coroutines.tasks.await

data class GpsLocationResult(
    val latitude: Double = 0.0,
    val longitude: Double = 0.0,
    val accuracy: Float = 0f,
    val isCaptured: Boolean = false
)

class GpsAuditManager(private val context: Context) {

    private val fusedLocationClient: FusedLocationProviderClient =
        LocationServices.getFusedLocationProviderClient(context)

    @SuppressLint("MissingPermission")
    suspend fun getCurrentLocation(): GpsLocationResult {
        return try {
            val cancellationTokenSource = CancellationTokenSource()

            // Tenta obter localização atual precisa
            val location: Location? = fusedLocationClient.getCurrentLocation(
                Priority.PRIORITY_HIGH_ACCURACY,
                cancellationTokenSource.token
            ).await()

            if (location != null) {
                GpsLocationResult(
                    latitude = location.latitude,
                    longitude = location.longitude,
                    accuracy = location.accuracy,
                    isCaptured = true
                )
            } else {
                // Fallback para última localização conhecida
                val lastLocation: Location? = fusedLocationClient.lastLocation.await()
                if (lastLocation != null) {
                    GpsLocationResult(
                        latitude = lastLocation.latitude,
                        longitude = lastLocation.longitude,
                        accuracy = lastLocation.accuracy,
                        isCaptured = true
                    )
                } else {
                    GpsLocationResult(isCaptured = false)
                }
            }
        } catch (e: Exception) {
            GpsLocationResult(isCaptured = false)
        }
    }
}
