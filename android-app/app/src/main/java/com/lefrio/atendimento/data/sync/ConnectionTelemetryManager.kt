package com.lefrio.atendimento.data.sync

import android.content.Context
import android.net.ConnectivityManager
import android.net.NetworkCapabilities
import android.os.Build
import android.os.SystemClock
import android.util.Log
import com.google.firebase.firestore.DocumentSnapshot
import com.google.firebase.firestore.FieldValue
import com.google.firebase.firestore.ListenerRegistration
import com.google.firebase.firestore.SetOptions
import com.google.firebase.firestore.Source
import com.lefrio.atendimento.data.FirebaseConfig
import com.lefrio.atendimento.data.auth.AuthRepository
import com.lefrio.atendimento.data.local.AppDatabase
import com.lefrio.atendimento.util.AppUpdateManager
import com.lefrio.atendimento.util.NetworkMonitor
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.delay
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.coroutines.tasks.await
import kotlinx.coroutines.withTimeout
import kotlinx.coroutines.withTimeoutOrNull
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import java.util.TimeZone
import kotlin.math.abs
import kotlin.math.roundToInt

/**
 * Gerenciador silencioso e instantâneo de telemetria e teste de conexão (Ping/Pong)
 * entre o painel administrativo e o aplicativo Android do técnico.
 *
 * Características:
 * - 100% invisível e imperceptível ao técnico (execução exclusiva em Dispatchers.IO, sem UI/Toasts/notificações).
 * - Escuta em tempo real apenas os documentos do técnico logado em 'technicianConnections'.
 * - Responde instantaneamente a solicitações de "Testar Conexão" medindo latência real (ms),
 *   tecnologia da rede (WIFI/5G/4G/3G/2G), largura de banda estimada e pendências offline.
 */
object ConnectionTelemetryManager {

    private const val TAG = "ConnectionTelemetry"
    private const val COLLECTION_NAME = "technicianConnections"
    private const val FOREGROUND_HEARTBEAT_INTERVAL_MS = 90_000L // 90s enquanto o app está aberto
    private const val MIN_PASSIVE_HEARTBEAT_GAP_MS = 20_000L
    private const val INITIAL_PING_FRESHNESS_WINDOW_MS = 20_000L
    private const val PING_PROBE_TIMEOUT_MS = 4_000L

    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
    private val publishMutex = Mutex()
    private val listenersLock = Any()

    private val activeListeners = mutableListOf<ListenerRegistration>()
    private var heartbeatLoopJob: Job? = null

    @Volatile
    private var appContext: Context? = null
    @Volatile
    private var activeTechId: String = ""
    @Volatile
    private var activeTechName: String = ""
    @Volatile
    private var activeTechPin: String = ""
    @Volatile
    private var isAppForeground: Boolean = false
    @Volatile
    private var lastHandledPingRequestedAt: String? = null
    @Volatile
    private var lastHeartbeatSentElapsedMs: Long = 0L

    /**
     * Inicia ou atualiza o vínculo silencioso usando o técnico atualmente autenticado na sessão local.
     */
    fun startForCurrentTechnician(context: Context) {
        val ctx = context.applicationContext
        appContext = ctx
        val authRepo = AuthRepository(ctx)
        val tech = authRepo.getSelectedTechnician()
        if (tech == null || tech.name.isBlank()) {
            stop()
            return
        }
        val pin = authRepo.getSelectedTechnicianPin()
        startOrUpdate(ctx, techId = tech.uid, techName = tech.name, techPin = pin)
    }

    /**
     * Vincula o listener instantâneo de ping para o técnico ativo.
     */
    fun startOrUpdate(context: Context, techId: String, techName: String, techPin: String = "") {
        val ctx = context.applicationContext
        appContext = ctx

        val normName = techName.trim().uppercase(Locale.ROOT)
        val normId = techId.trim().uppercase(Locale.ROOT)
        val normPin = techPin.trim().uppercase(Locale.ROOT)
        if (normName.isBlank() && normId.isBlank()) return

        val isSameTech = normName == activeTechName && normId == activeTechId && normPin == activeTechPin
        val hasActiveListeners = synchronized(listenersLock) { activeListeners.isNotEmpty() }

        if (isSameTech && hasActiveListeners) {
            if (isAppForeground) {
                ensureForegroundHeartbeatLoop()
            }
            return
        }

        activeTechId = normId
        activeTechName = normName
        activeTechPin = normPin
        lastHandledPingRequestedAt = null

        scope.launch {
            attachRealtimePingListeners(ctx, normName, normId, normPin)
            sendTelemetrySilently(ctx, respondedPingToken = null, force = false)
            if (isAppForeground) {
                ensureForegroundHeartbeatLoop()
            }
        }
    }

    fun onAppForegrounded(context: Context) {
        val ctx = context.applicationContext
        appContext = ctx
        isAppForeground = true

        val authRepo = AuthRepository(ctx)
        val tech = authRepo.getSelectedTechnician()
        if (tech == null || tech.name.isBlank()) {
            stop()
            return
        }

        val pin = authRepo.getSelectedTechnicianPin()
        startOrUpdate(ctx, techId = tech.uid, techName = tech.name, techPin = pin)
        ensureForegroundHeartbeatLoop()

        scope.launch {
            sendTelemetrySilently(ctx, respondedPingToken = null, force = false)
        }
    }

    fun onAppBackgrounded() {
        isAppForeground = false
        heartbeatLoopJob?.cancel()
        heartbeatLoopJob = null
        // Mantém o listener de ping ativo enquanto o processo permanecer vivo para responder testes mesmo com tela minimizada
    }

    fun onNetworkRegained(context: Context) {
        val ctx = context.applicationContext
        appContext = ctx
        if (activeTechName.isBlank() && activeTechId.isBlank()) {
            startForCurrentTechnician(ctx)
            return
        }

        scope.launch {
            val hasListeners = synchronized(listenersLock) { activeListeners.isNotEmpty() }
            if (!hasListeners) {
                attachRealtimePingListeners(ctx, activeTechName, activeTechId, activeTechPin)
            }
            sendTelemetrySilently(ctx, respondedPingToken = null, force = true)
        }
    }

    fun stop() {
        isAppForeground = false
        heartbeatLoopJob?.cancel()
        heartbeatLoopJob = null
        activeTechId = ""
        activeTechName = ""
        activeTechPin = ""
        lastHandledPingRequestedAt = null
        clearListeners()
    }

    private fun clearListeners() {
        synchronized(listenersLock) {
            activeListeners.forEach { reg ->
                try {
                    reg.remove()
                } catch (_: Exception) {
                }
            }
            activeListeners.clear()
        }
    }

    private fun ensureForegroundHeartbeatLoop() {
        if (heartbeatLoopJob?.isActive == true) return
        heartbeatLoopJob = scope.launch {
            while (isActive && isAppForeground) {
                delay(FOREGROUND_HEARTBEAT_INTERVAL_MS)
                val ctx = appContext ?: continue
                if (activeTechName.isBlank() && activeTechId.isBlank()) break
                if (NetworkMonitor.hasValidatedInternet(ctx)) {
                    sendTelemetrySilently(ctx, respondedPingToken = null, force = false)
                }
            }
        }
    }

    private suspend fun attachRealtimePingListeners(
        context: Context,
        techName: String,
        techId: String,
        techPin: String
    ) {
        try {
            withTimeoutOrNull(8_000L) {
                FirebaseConfig.ensureAuthenticated()
            }
            val firestore = FirebaseConfig.getFirestore()
            val keysToListen = linkedSetOf<String>().apply {
                if (techName.isNotBlank()) add(techName)
                if (techPin.isNotBlank()) add(techPin)
                if (techId.isNotBlank()) add(techId)
            }

            clearListeners()

            val newRegistrations = mutableListOf<ListenerRegistration>()
            for (docKey in keysToListen) {
                var isFirstSnapshot = true
                val reg = firestore.collection(COLLECTION_NAME)
                    .document(docKey)
                    .addSnapshotListener { snapshot, error ->
                        if (error != null || snapshot == null || !snapshot.exists()) {
                            isFirstSnapshot = false
                            return@addSnapshotListener
                        }
                        val first = isFirstSnapshot
                        isFirstSnapshot = false
                        handleSnapshotPingEvent(context, snapshot, isInitialSnapshot = first)
                    }
                newRegistrations.add(reg)
            }

            synchronized(listenersLock) {
                activeListeners.addAll(newRegistrations)
            }
        } catch (e: Exception) {
            Log.d(TAG, "Listener de ping adiado (offline/auth): ${e.message}")
        }
    }

    private fun handleSnapshotPingEvent(
        context: Context,
        snapshot: DocumentSnapshot,
        isInitialSnapshot: Boolean
    ) {
        val requestedAt = snapshot.getString("pingRequestedAt")?.trim().orEmpty()
        if (requestedAt.isBlank()) return

        // Já respondido anteriormente pelo aparelho (ou já gravado neste doc)
        val alreadyResponded = snapshot.getString("pingRespondedAt")?.trim().orEmpty()
        if (requestedAt == lastHandledPingRequestedAt || requestedAt == alreadyResponded) {
            return
        }

        // No primeiro snapshot ao abrir o app, só responde se o pedido de ping for recém-enviado
        if (isInitialSnapshot) {
            val reqMillis = parseIsoUtcMillis(requestedAt)
            if (reqMillis == null || abs(System.currentTimeMillis() - reqMillis) > INITIAL_PING_FRESHNESS_WINDOW_MS) {
                lastHandledPingRequestedAt = requestedAt
                return
            }
        }

        lastHandledPingRequestedAt = requestedAt
        scope.launch {
            sendTelemetrySilently(context, respondedPingToken = requestedAt, force = true)
        }
    }

    /**
     * Mede latência real contra o servidor Firestore + características da rede ativa
     * e publica silenciosamente em 'technicianConnections'.
     */
    private suspend fun sendTelemetrySilently(
        context: Context,
        respondedPingToken: String?,
        force: Boolean
    ) {
        val primaryKey = activeTechName.ifBlank { activeTechId }
        if (primaryKey.isBlank()) return
        if (!NetworkMonitor.hasValidatedInternet(context)) return

        val elapsedNow = SystemClock.elapsedRealtime()
        if (!force && respondedPingToken == null && (elapsedNow - lastHeartbeatSentElapsedMs) < MIN_PASSIVE_HEARTBEAT_GAP_MS) {
            return
        }

        publishMutex.withLock {
            if (!NetworkMonitor.hasValidatedInternet(context)) return@withLock

            try {
                val authOk = withTimeoutOrNull(6_000L) {
                    FirebaseConfig.ensureAuthenticated()
                    true
                } ?: false
                if (!authOk) return@withLock

                val firestore = FirebaseConfig.getFirestore()
                val primaryRef = firestore.collection(COLLECTION_NAME).document(primaryKey)

                // 1. Medição real e ultra-leve de latência (RTT) direto no servidor Firestore
                val probeStartMs = SystemClock.elapsedRealtime()
                val probeOk = withTimeoutOrNull(PING_PROBE_TIMEOUT_MS) {
                    primaryRef.get(Source.SERVER).await()
                    true
                } ?: false
                val measuredPingMs = if (probeOk) {
                    (SystemClock.elapsedRealtime() - probeStartMs).coerceIn(1L, 30_000L).toInt()
                } else {
                    null
                }

                // 2. Coleta sem permissões extras da tecnologia de sinal e banda ativa
                val netMetrics = readNetworkMetrics(context, measuredPingMs)

                // 3. Contagem real de pendências na fila offline local (Room)
                val pendingCount = try {
                    AppDatabase.getInstance(context).syncQueueDao().getPendingTasksCountSync()
                } catch (_: Exception) {
                    0
                }

                val versionName = try {
                    AppUpdateManager(context).getCurrentVersionName()
                } catch (_: Exception) {
                    "1.3"
                }

                val brand = (Build.MANUFACTURER ?: "").trim().replaceFirstChar { it.uppercase() }
                val model = (Build.MODEL ?: "").trim()
                val deviceLabel = if (model.startsWith(brand, ignoreCase = true)) model else "$brand $model".trim()
                val deviceInfo = "Android ${Build.VERSION.RELEASE} • $deviceLabel • App v$versionName".take(250)

                val nowIso = formatIsoUtc(Date())
                val payload = hashMapOf<String, Any>(
                    "technicianId" to primaryKey,
                    "technicianName" to activeTechName.ifBlank { primaryKey },
                    "isOnline" to true,
                    "effectiveType" to netMetrics.effectiveType,
                    "lastSeenAt" to nowIso,
                    "pendingOfflineCount" to pendingCount,
                    "deviceInfo" to deviceInfo,
                    "appVersion" to versionName,
                    "platform" to "android",
                    "updatedAt" to FieldValue.serverTimestamp()
                )

                if (activeTechPin.isNotBlank()) {
                    payload["technicianPin"] = activeTechPin
                }
                if (measuredPingMs != null) {
                    payload["pingMs"] = measuredPingMs
                    payload["rttMs"] = measuredPingMs
                }
                if (netMetrics.downlinkMbps != null) {
                    payload["downlinkMbps"] = netMetrics.downlinkMbps
                }
                if (!respondedPingToken.isNullOrBlank()) {
                    payload["pingRespondedAt"] = respondedPingToken
                }

                // Grava no documento principal (Nome) e replica em PIN/ID se distintos para resposta imediata no painel
                val targetKeys = linkedSetOf<String>().apply {
                    add(primaryKey)
                    if (activeTechPin.isNotBlank()) add(activeTechPin)
                    if (activeTechId.isNotBlank()) add(activeTechId)
                }

                withTimeout(6_000L) {
                    for (key in targetKeys) {
                        firestore.collection(COLLECTION_NAME)
                            .document(key)
                            .set(payload, SetOptions.merge())
                            .await()
                    }
                }

                lastHeartbeatSentElapsedMs = SystemClock.elapsedRealtime()
            } catch (e: Exception) {
                Log.d(TAG, "Telemetria silenciosa ignorada por oscilação de sinal: ${e.message}")
            }
        }
    }

    private data class NetworkMetrics(
        val effectiveType: String,
        val downlinkMbps: Double?
    )

    private fun readNetworkMetrics(context: Context, pingMs: Int?): NetworkMetrics {
        return try {
            val cm = context.getSystemService(Context.CONNECTIVITY_SERVICE) as ConnectivityManager
            val activeNetwork = cm.activeNetwork
            val caps = if (activeNetwork != null) cm.getNetworkCapabilities(activeNetwork) else null

            if (caps == null) {
                return NetworkMetrics("offline", null)
            }

            val downstreamKbps = caps.linkDownstreamBandwidthKbps
            val downlinkMbps = if (downstreamKbps > 0) {
                ((downstreamKbps / 1000.0) * 10.0).roundToInt() / 10.0
            } else {
                null
            }

            val effectiveType = when {
                caps.hasTransport(NetworkCapabilities.TRANSPORT_WIFI) -> "wifi"
                caps.hasTransport(NetworkCapabilities.TRANSPORT_ETHERNET) -> "wifi"
                caps.hasTransport(NetworkCapabilities.TRANSPORT_CELLULAR) -> {
                    when {
                        downstreamKbps >= 50_000 -> "5g"
                        downstreamKbps >= 5_000 -> "4g"
                        downstreamKbps >= 500 -> "3g"
                        downstreamKbps > 0 -> "2g"
                        pingMs != null && pingMs < 250 -> "4g"
                        pingMs != null && pingMs < 600 -> "3g"
                        else -> "2g"
                    }
                }
                else -> "4g"
            }

            NetworkMetrics(effectiveType, downlinkMbps)
        } catch (_: Exception) {
            NetworkMetrics("4g", null)
        }
    }

    private fun formatIsoUtc(date: Date): String {
        val sdf = SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", Locale.US)
        sdf.timeZone = TimeZone.getTimeZone("UTC")
        return sdf.format(date)
    }

    private fun parseIsoUtcMillis(iso: String): Long? {
        val patterns = listOf(
            "yyyy-MM-dd'T'HH:mm:ss.SSS'Z'",
            "yyyy-MM-dd'T'HH:mm:ss'Z'"
        )
        for (pattern in patterns) {
            try {
                val sdf = SimpleDateFormat(pattern, Locale.US)
                sdf.timeZone = TimeZone.getTimeZone("UTC")
                val parsed = sdf.parse(iso)
                if (parsed != null) return parsed.time
            } catch (_: Exception) {
            }
        }
        return null
    }
}
