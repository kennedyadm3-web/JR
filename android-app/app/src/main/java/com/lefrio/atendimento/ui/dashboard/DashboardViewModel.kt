package com.lefrio.atendimento.ui.dashboard

import android.app.Application
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import com.google.firebase.firestore.ListenerRegistration
import com.lefrio.atendimento.data.FirebaseConfig
import com.lefrio.atendimento.data.local.AppDatabase
import com.lefrio.atendimento.data.local.entity.ServiceOrderEntity
import com.lefrio.atendimento.data.repository.ServiceOrderRepository
import com.lefrio.atendimento.data.sync.FirebaseSyncManager
import com.lefrio.atendimento.data.sync.SyncWorker
import com.lefrio.atendimento.util.NetworkMonitor
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.*
import kotlinx.coroutines.launch
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

data class DashboardUiState(
    val orders: List<ServiceOrderEntity> = emptyList(),
    val filteredOrders: List<ServiceOrderEntity> = emptyList(),
    val progressMap: Map<String, Pair<Int, Int>> = emptyMap(),
    val selectedFilter: String = "TODAS", // "TODAS", "PREVENTIVAS", "ORDENS", "aberta", "finalizada"
    val searchQuery: String = "",
    val isOnline: Boolean = true,
    val pendingSyncCount: Int = 0,
    val totalVisitsCount: Int = 0,
    val preventiveCount: Int = 0,
    val correctiveCount: Int = 0,
    val openCount: Int = 0,
    val inProgressCount: Int = 0,
    val completedCount: Int = 0,
    val isLoading: Boolean = false,
    val isSyncing: Boolean = false,
    val syncMessage: String? = null,
    val selectedDate: String = SimpleDateFormat("yyyy-MM-dd", Locale.getDefault()).format(Date()),
    val effectiveRouteDate: String = SimpleDateFormat("yyyy-MM-dd", Locale.getDefault()).format(Date())
)

class DashboardViewModel(application: Application) : AndroidViewModel(application) {

    private val repository = ServiceOrderRepository(application)
    private val networkMonitor = NetworkMonitor(application)
    private val db = AppDatabase.getInstance(application)

    private val _uiState = MutableStateFlow(DashboardUiState())
    val uiState: StateFlow<DashboardUiState> = _uiState.asStateFlow()

    private var currentTechName: String = ""
    private var currentTechId: String = ""
    private val selectedTechFlow = MutableStateFlow(Pair("", ""))
    private var tech1Listener: ListenerRegistration? = null
    private var tech2Listener: ListenerRegistration? = null
    private var realtimeSyncJob: Job? = null
    private var lastListenedTechName: String = ""

    init {
        // Observa conectividade de rede validada
        viewModelScope.launch {
            var hadOffline = false
            networkMonitor.isOnline.collect { online ->
                _uiState.update { it.copy(isOnline = online) }
                if (!online) {
                    hadOffline = true
                } else {
                    SyncWorker.triggerImmediateSync(getApplication())
                    if (currentTechName.isNotBlank()) {
                        if (tech1Listener == null) {
                            lastListenedTechName = ""
                            startRealtimeItineraryListeners(currentTechName)
                        }
                        if (hadOffline) {
                            hadOffline = false
                            launch {
                                try {
                                    FirebaseSyncManager(getApplication()).processPendingSyncQueue()
                                    val todayDate = getTodayIsoDate()
                                    _uiState.update { it.copy(selectedDate = todayDate) }
                                    repository.syncDailyItinerary(
                                        technicianName = currentTechName,
                                        technicianId = currentTechId,
                                        targetDate = todayDate
                                    )
                                } catch (_: Exception) {}
                            }
                        }
                    }
                }
            }
        }

        // Observa tarefas pendentes na fila de sincronização
        viewModelScope.launch {
            db.syncQueueDao().getPendingTasksCountFlow().collect { count ->
                _uiState.update { it.copy(pendingSyncCount = count) }
            }
        }

        // Observa progresso do checklist por O.S. (máquinas atendidas)
        viewModelScope.launch {
            repository.getAllOrdersProgress().collect { progressList ->
                val map = progressList.associate { it.orderId to Pair(it.completedCount, it.totalCount) }
                _uiState.update { it.copy(progressMap = map) }
            }
        }

        // Observa Ordens e Atendimentos do banco local Room combinados com o técnico ativo
        viewModelScope.launch {
            combine(repository.getAllOrders(), selectedTechFlow) { rawList, (techName, techId) ->
                val todayDate = getTodayIsoDate()
                filterOrdersForTechAndDate(rawList, techName, techId, todayDate)
            }.collect { (list, effectiveDate, todayDate) ->
                val prev = list.count { it.type.contains("PREVENTIVA", ignoreCase = true) }
                val corr = list.count { it.type.contains("ORDEM", ignoreCase = true) || it.type.contains("CORRETIVA", ignoreCase = true) }
                val open = list.count { it.status == "aberta" }
                val progress = list.count { it.status == "em_andamento" }
                val completed = list.count { it.status == "finalizada" }

                _uiState.update { state ->
                    val filtered = applyFilterAndSearch(list, state.selectedFilter, state.searchQuery)
                    state.copy(
                        orders = list,
                        filteredOrders = filtered,
                        totalVisitsCount = list.size,
                        preventiveCount = prev,
                        correctiveCount = corr,
                        openCount = open,
                        inProgressCount = progress,
                        completedCount = completed,
                        selectedDate = todayDate,
                        effectiveRouteDate = effectiveDate,
                        isLoading = false
                    )
                }
            }
        }
    }

    private fun getTodayIsoDate(): String {
        return SimpleDateFormat("yyyy-MM-dd", Locale.getDefault()).format(Date())
    }

    private fun isIsoDate(value: String): Boolean {
        return value.length == 10 && value[4] == '-' && value[7] == '-'
    }

    private fun subtractDays(isoDate: String, days: Int): String {
        return try {
            val sdf = SimpleDateFormat("yyyy-MM-dd", Locale.US)
            val parsed = sdf.parse(isoDate.take(10)) ?: Date()
            val cal = java.util.Calendar.getInstance().apply {
                time = parsed
                add(java.util.Calendar.DAY_OF_YEAR, -days)
            }
            sdf.format(cal.time)
        } catch (_: Exception) {
            isoDate.take(10)
        }
    }

    private fun filterOrdersForTechAndDate(
        allOrders: List<ServiceOrderEntity>,
        rawTechName: String,
        rawTechId: String,
        todayDate: String
    ): Triple<List<ServiceOrderEntity>, String, String> {
        val techName = rawTechName.trim().uppercase()
        val techId = rawTechId.trim().uppercase()
        val techOrders = if (techName.isBlank() && techId.isBlank()) {
            allOrders
        } else {
            allOrders.filter { o ->
                val t1 = o.technician1.trim().uppercase()
                val t2 = (o.technician2 ?: "").trim().uppercase()
                (techName.isNotBlank() && (t1.contains(techName) || techName.contains(t1) || (t2.isNotBlank() && (t2.contains(techName) || techName.contains(t2))))) ||
                (techId.isNotBlank() && (t1 == techId || t2 == techId))
            }
        }

        val minPastDate = subtractDays(todayDate, 7)

        // Separa preventivas e ordens de serviço corretivas
        val (preventives, nonPreventives) = techOrders.partition {
            it.id.startsWith("PREV_") || it.type.contains("PREVENTIVA", ignoreCase = true)
        }

        // 1. Preventivas: NUNCA mostrar datas futuras (> todayDate).
        // Se houver agendadas para hoje, exibe somente hoje; senão, exibe a última agendada nos últimos 7 dias.
        val eligiblePreventives = preventives.filter { o ->
            val pDate = (o.plannedDate ?: "").trim().take(10)
            !o.isSyncedWithServer || (isIsoDate(pDate) && pDate <= todayDate && pDate >= minPastDate)
        }

        val syncedDatesDesc = eligiblePreventives
            .map { (it.plannedDate ?: "").trim().take(10) }
            .filter { isIsoDate(it) && it <= todayDate && it >= minPastDate }
            .distinct()
            .sortedDescending()

        val activePreventiveDate: String? = when {
            syncedDatesDesc.contains(todayDate) -> todayDate
            else -> syncedDatesDesc.firstOrNull { it < todayDate && it >= minPastDate }
        }

        val visiblePreventives = eligiblePreventives.filter { o ->
            if (!o.isSyncedWithServer) {
                true
            } else if (activePreventiveDate != null) {
                (o.plannedDate ?: "").trim().take(10) == activePreventiveDate
            } else {
                false
            }
        }

        // 2. Ordens de Serviço (corretivas): nunca exibir ordens com data futura (> todayDate)
        val visibleNonPreventives = nonPreventives.filter { o ->
            val pDate = (o.plannedDate ?: "").trim().take(10)
            !o.isSyncedWithServer || !isIsoDate(pDate) || pDate <= todayDate
        }

        val combined = visiblePreventives + visibleNonPreventives
        return Triple(combined, activePreventiveDate ?: todayDate, todayDate)
    }

    /**
     * Inicializa ou atualiza o itinerário do dia para o técnico logado
     */
    fun loadItineraryForTechnician(techName: String, techId: String) {
        currentTechName = techName
        currentTechId = techId
        selectedTechFlow.value = Pair(techName, techId)
        startRealtimeItineraryListeners(techName)
        viewModelScope.launch {
            val todayDate = getTodayIsoDate()
            _uiState.update { it.copy(isLoading = true, selectedDate = todayDate) }
            repository.syncDailyItinerary(
                technicianName = techName,
                technicianId = techId,
                targetDate = todayDate
            )
            _uiState.update { it.copy(isLoading = false) }
        }
    }

    /**
     * Escuta alterações em tempo real no Firestore (ex: administrativo excluiu agendamento,
     * reabriu planilha ou escalou novo endereço) e reconcilia imediatamente o banco local Room.
     */
    private fun startRealtimeItineraryListeners(techName: String) {
        val normTechName = techName.trim().uppercase()
        if (normTechName.isBlank() || normTechName == lastListenedTechName) return
        lastListenedTechName = normTechName

        tech1Listener?.remove()
        tech2Listener?.remove()
        tech1Listener = null
        tech2Listener = null

        viewModelScope.launch {
            try {
                FirebaseConfig.ensureAuthenticated()
                val firestore = FirebaseConfig.getFirestore()

                var firstSnap1 = true
                tech1Listener = firestore.collection("maintenanceRecords")
                    .whereEqualTo("technician1", normTechName)
                    .addSnapshotListener { _, error ->
                        if (error != null) return@addSnapshotListener
                        if (firstSnap1) {
                            firstSnap1 = false
                            return@addSnapshotListener
                        }
                        scheduleRealtimeSync()
                    }

                var firstSnap2 = true
                tech2Listener = firestore.collection("maintenanceRecords")
                    .whereEqualTo("technician2", normTechName)
                    .addSnapshotListener { _, error ->
                        if (error != null) return@addSnapshotListener
                        if (firstSnap2) {
                            firstSnap2 = false
                            return@addSnapshotListener
                        }
                        scheduleRealtimeSync()
                    }
            } catch (_: Exception) {}
        }
    }

    private fun scheduleRealtimeSync() {
        realtimeSyncJob?.cancel()
        realtimeSyncJob = viewModelScope.launch {
            delay(600)
            if (currentTechName.isNotBlank()) {
                val todayDate = getTodayIsoDate()
                _uiState.update { it.copy(selectedDate = todayDate) }
                repository.syncDailyItinerary(
                    technicianName = currentTechName,
                    technicianId = currentTechId,
                    targetDate = todayDate
                )
            }
        }
    }

    override fun onCleared() {
        super.onCleared()
        realtimeSyncJob?.cancel()
        tech1Listener?.remove()
        tech2Listener?.remove()
    }

    fun setFilter(filter: String) {
        _uiState.update { state ->
            val filtered = applyFilterAndSearch(state.orders, filter, state.searchQuery)
            state.copy(selectedFilter = filter, filteredOrders = filtered)
        }
    }

    fun setSearchQuery(query: String) {
        _uiState.update { state ->
            val filtered = applyFilterAndSearch(state.orders, state.selectedFilter, query)
            state.copy(searchQuery = query, filteredOrders = filtered)
        }
    }

    fun forceSync() {
        viewModelScope.launch {
            if (!NetworkMonitor.hasValidatedInternet(getApplication())) {
                _uiState.update {
                    it.copy(
                        isLoading = false,
                        isSyncing = false,
                        syncMessage = "Sem internet estável no momento. Seus dados continuam salvos com segurança no aparelho e serão enviados automaticamente quando a conexão voltar."
                    )
                }
                return@launch
            }

            _uiState.update { it.copy(isLoading = true, isSyncing = true, syncMessage = null) }
            val syncManager = FirebaseSyncManager(getApplication())
            val syncedPending = try {
                syncManager.processPendingSyncQueue()
            } catch (_: Exception) {
                0
            }

            var foundCount = 0
            if (currentTechName.isNotBlank()) {
                val todayDate = getTodayIsoDate()
                _uiState.update { it.copy(selectedDate = todayDate) }
                foundCount = repository.syncDailyItinerary(currentTechName, currentTechId, todayDate)
            }
            val remainingPending = try {
                db.syncQueueDao().getPendingTasksCountSync()
            } catch (_: Exception) {
                0
            }
            if (remainingPending > 0) {
                SyncWorker.triggerImmediateSync(getApplication())
            }

            val msg = when {
                remainingPending > 0 -> "Conexão instável: $syncedPending enviado(s), $remainingPending pendência(s) protegida(s) no aparelho para nova tentativa automática."
                syncedPending > 0 -> "Sincronização concluída! $syncedPending pendência(s) enviada(s) ao servidor e $foundCount endereço(s) no roteiro."
                foundCount > 0 -> "Sincronização concluída! $foundCount endereço(s)/ordem(ns) no seu roteiro."
                else -> "Sincronização concluída: Servidor verificado, nenhum novo endereço pendente."
            }
            _uiState.update { it.copy(isLoading = false, isSyncing = false, syncMessage = msg) }
        }
    }

    fun clearSyncMessage() {
        _uiState.update { it.copy(syncMessage = null) }
    }

    private fun applyFilterAndSearch(
        orders: List<ServiceOrderEntity>,
        filter: String,
        query: String
    ): List<ServiceOrderEntity> {
        return orders.filter { order ->
            val matchesFilter = when (filter) {
                "TODAS" -> true
                "PREVENTIVAS" -> order.type.contains("PREVENTIVA", ignoreCase = true)
                "ORDENS" -> order.type.contains("ORDEM", ignoreCase = true) || order.type.contains("CORRETIVA", ignoreCase = true)
                "aberta" -> order.status == "aberta" || order.status == "em_andamento"
                "finalizada" -> order.status == "finalizada"
                else -> order.status.equals(filter, ignoreCase = true)
            }

            val q = query.trim().lowercase()
            val matchesSearch = q.isEmpty() ||
                    order.osNumber.lowercase().contains(q) ||
                    order.clientName.lowercase().contains(q) ||
                    order.addressStreet.lowercase().contains(q) ||
                    order.type.lowercase().contains(q)

            matchesFilter && matchesSearch
        }
    }
}
