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

data class DashboardUiState(
    val orders: List<ServiceOrderEntity> = emptyList(),
    val filteredOrders: List<ServiceOrderEntity> = emptyList(),
    val selectedFilter: String = "TODAS", // "TODAS", "aberta", "em_andamento", "finalizada"
    val searchQuery: String = "",
    val isOnline: Boolean = true,
    val pendingSyncCount: Int = 0,
    val openCount: Int = 0,
    val inProgressCount: Int = 0,
    val completedCount: Int = 0,
    val isLoading: Boolean = false
)

class DashboardViewModel(application: Application) : AndroidViewModel(application) {

    private val repository = ServiceOrderRepository(application)
    private val networkMonitor = NetworkMonitor(application)
    private val db = AppDatabase.getInstance(application)

    private val _uiState = MutableStateFlow(DashboardUiState())
    val uiState: StateFlow<DashboardUiState> = _uiState.asStateFlow()

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

        // Observa tarefas pendentes na fila de sync
        viewModelScope.launch {
            db.syncQueueDao().getPendingTasksCountFlow().collect { count ->
                _uiState.update { it.copy(pendingSyncCount = count) }
            }
        }

        // Observa Ordens de Serviço do banco local Room
        viewModelScope.launch {
            repository.getAllOrders().collect { list ->
                val open = list.count { it.status == "aberta" }
                val progress = list.count { it.status == "em_andamento" }
                val completed = list.count { it.status == "finalizada" }

                _uiState.update { state ->
                    val filtered = applyFilterAndSearch(list, state.selectedFilter, state.searchQuery)
                    state.copy(
                        orders = list,
                        filteredOrders = filtered,
                        openCount = open,
                        inProgressCount = progress,
                        completedCount = completed
                    )
                }
            }
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
        SyncWorker.triggerImmediateSync(getApplication())
    }

    private fun applyFilterAndSearch(
        orders: List<ServiceOrderEntity>,
        filter: String,
        query: String
    ): List<ServiceOrderEntity> {
        return orders.filter { order ->
            val matchesFilter = when (filter) {
                "TODAS" -> true
                else -> order.status.equals(filter, ignoreCase = true)
            }

            val q = query.trim().lowercase()
            val matchesSearch = q.isEmpty() ||
                    order.osNumber.lowercase().contains(q) ||
                    order.clientName.lowercase().contains(q) ||
                    order.addressStreet.lowercase().contains(q)

            matchesFilter && matchesSearch
        }
    }
}
