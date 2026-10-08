package com.lefrio.atendimento.ui.dashboard

import android.app.Application
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import com.lefrio.atendimento.data.local.AppDatabase
import com.lefrio.atendimento.data.local.entity.ServiceOrderEntity
import com.lefrio.atendimento.data.repository.ServiceOrderRepository
import com.lefrio.atendimento.data.sync.SyncWorker
import com.lefrio.atendimento.util.NetworkMonitor
import kotlinx.coroutines.flow.*
import kotlinx.coroutines.launch
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

data class DashboardUiState(
    val orders: List<ServiceOrderEntity> = emptyList(),
    val filteredOrders: List<ServiceOrderEntity> = emptyList(),
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
    val selectedDate: String = SimpleDateFormat("yyyy-MM-dd", Locale.getDefault()).format(Date())
)

class DashboardViewModel(application: Application) : AndroidViewModel(application) {

    private val repository = ServiceOrderRepository(application)
    private val networkMonitor = NetworkMonitor(application)
    private val db = AppDatabase.getInstance(application)

    private val _uiState = MutableStateFlow(DashboardUiState())
    val uiState: StateFlow<DashboardUiState> = _uiState.asStateFlow()

    private var currentTechName: String = ""
    private var currentTechId: String = ""

    init {
        // Observa conectividade de rede
        viewModelScope.launch {
            networkMonitor.isOnline.collect { online ->
                _uiState.update { it.copy(isOnline = online) }
                if (online) {
                    SyncWorker.triggerImmediateSync(getApplication())
                }
            }
        }

        // Observa tarefas pendentes na fila de sincronização
        viewModelScope.launch {
            db.syncQueueDao().getPendingTasksCountFlow().collect { count ->
                _uiState.update { it.copy(pendingSyncCount = count) }
            }
        }

        // Observa Ordens e Atendimentos do banco local Room
        viewModelScope.launch {
            repository.getAllOrders().collect { list ->
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
                        isLoading = false
                    )
                }
            }
        }
    }

    /**
     * Inicializa ou atualiza o itinerário do dia para o técnico logado
     */
    fun loadItineraryForTechnician(techName: String, techId: String) {
        currentTechName = techName
        currentTechId = techId
        viewModelScope.launch {
            _uiState.update { it.copy(isLoading = true) }
            repository.syncDailyItinerary(
                technicianName = techName,
                technicianId = techId,
                targetDate = _uiState.value.selectedDate
            )
            _uiState.update { it.copy(isLoading = false) }
        }
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
            _uiState.update { it.copy(isLoading = true) }
            if (currentTechName.isNotBlank()) {
                repository.syncDailyItinerary(currentTechName, currentTechId, _uiState.value.selectedDate)
            }
            SyncWorker.triggerImmediateSync(getApplication())
            _uiState.update { it.copy(isLoading = false) }
        }
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
