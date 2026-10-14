package com.lefrio.atendimento.ui.serviceorders

import android.app.Application
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import com.lefrio.atendimento.data.auth.TechnicianUser
import com.lefrio.atendimento.data.local.entity.ServiceOrderEntity
import com.lefrio.atendimento.data.local.entity.TechnicianEntity
import com.lefrio.atendimento.data.repository.*
import com.lefrio.atendimento.data.sync.SyncWorker
import kotlinx.coroutines.flow.*
import kotlinx.coroutines.launch
import java.text.SimpleDateFormat
import java.util.*

enum class OSFilterTab {
    ALL,
    OPEN,
    IN_PROGRESS,
    FINISHED
}

data class ServiceOrdersUiState(
    val orders: List<ServiceOrderEntity> = emptyList(),
    val filteredOrders: List<ServiceOrderEntity> = emptyList(),
    val selectedTab: OSFilterTab = OSFilterTab.ALL,
    val searchQuery: String = "",
    val totalCount: Int = 0,
    val openCount: Int = 0,
    val inProgressCount: Int = 0,
    val finishedCount: Int = 0,
    val isLoading: Boolean = false,
    val isSyncing: Boolean = false,
    val isLoadingEquipments: Boolean = false,
    val isCreateModalOpen: Boolean = false,
    val selectedDate: String = SimpleDateFormat("yyyy-MM-dd", Locale.getDefault()).format(Date()),
    val clients: List<ClientOption> = emptyList(),
    val addresses: List<AddressOption> = emptyList(),
    val equipments: List<EquipmentOption> = emptyList(),
    val technicians: List<TechnicianEntity> = emptyList(),
    val errorMessage: String? = null
)

class ServiceOrdersViewModel(
    application: Application,
    private val currentUser: TechnicianUser
) : AndroidViewModel(application) {

    private val repository = ServiceOrderRepository(application)
    private val _uiState = MutableStateFlow(ServiceOrdersUiState())
    val uiState: StateFlow<ServiceOrdersUiState> = _uiState.asStateFlow()

    init {
        loadData()
        triggerSync()
        observeOrders()
    }

    private fun observeOrders() {
        viewModelScope.launch {
            val todayStr = SimpleDateFormat("yyyy-MM-dd", Locale.getDefault()).format(Date())
            repository.getServiceOrdersForTechnicianAndDate(
                technicianName = currentUser.name,
                technicianId = currentUser.uid,
                date = todayStr
            ).collect { myOrdersForToday ->
                updateFilteredList(myOrdersForToday, _uiState.value.selectedTab, _uiState.value.searchQuery)
            }
        }
    }

    fun loadData() {
        viewModelScope.launch {
            _uiState.update { it.copy(isLoading = true) }
            try {
                val todayStr = SimpleDateFormat("yyyy-MM-dd", Locale.getDefault()).format(Date())
                var (scheduledClients, scheduledAddresses) = repository.getScheduledClientsAndAddressesForTechnician(
                    technicianName = currentUser.name,
                    technicianId = currentUser.uid,
                    date = todayStr
                )
                if (scheduledClients.isEmpty() || scheduledAddresses.isEmpty()) {
                    val available = repository.getAvailableClientsAndAddresses()
                    if (scheduledClients.isEmpty()) scheduledClients = available.first
                    if (scheduledAddresses.isEmpty()) scheduledAddresses = available.second
                }
                val techs = repository.getAllTechnicians()
                _uiState.update {
                    it.copy(
                        clients = scheduledClients,
                        addresses = scheduledAddresses,
                        technicians = techs,
                        isLoading = false
                    )
                }
            } catch (e: Exception) {
                _uiState.update { it.copy(isLoading = false) }
            }
        }
    }

    fun setFilterTab(tab: OSFilterTab) {
        _uiState.update { it.copy(selectedTab = tab) }
        updateFilteredList(_uiState.value.orders, tab, _uiState.value.searchQuery)
    }

    fun setSearchQuery(query: String) {
        _uiState.update { it.copy(searchQuery = query) }
        updateFilteredList(_uiState.value.orders, _uiState.value.selectedTab, query)
    }

    private fun updateFilteredList(
        orders: List<ServiceOrderEntity>,
        tab: OSFilterTab,
        query: String
    ) {
        val total = orders.size
        val open = orders.count { it.status == "aberta" }
        val inProg = orders.count { it.status == "em_andamento" }
        val fin = orders.count { it.status == "finalizada" }

        val tabFiltered = when (tab) {
            OSFilterTab.ALL -> orders
            OSFilterTab.OPEN -> orders.filter { it.status == "aberta" }
            OSFilterTab.IN_PROGRESS -> orders.filter { it.status == "em_andamento" }
            OSFilterTab.FINISHED -> orders.filter { it.status == "finalizada" }
        }

        val q = query.trim().lowercase()
        val finalFiltered = if (q.isBlank()) {
            tabFiltered
        } else {
            tabFiltered.filter { order ->
                order.osNumber.lowercase().contains(q) ||
                order.clientName.lowercase().contains(q) ||
                order.addressStreet.lowercase().contains(q) ||
                order.type.lowercase().contains(q) ||
                (order.generalNotes?.lowercase()?.contains(q) == true)
            }
        }

        _uiState.update {
            it.copy(
                orders = orders,
                filteredOrders = finalFiltered,
                totalCount = total,
                openCount = open,
                inProgressCount = inProg,
                finishedCount = fin
            )
        }
    }

    fun openCreateModal() {
        _uiState.update { it.copy(isCreateModalOpen = true) }
        loadData()
    }

    fun closeCreateModal() {
        _uiState.update { it.copy(isCreateModalOpen = false) }
    }

    fun loadEquipmentsForAddress(addressId: String) {
        viewModelScope.launch {
            _uiState.update { it.copy(isLoadingEquipments = true) }
            val list = repository.getEquipmentsForAddress(addressId)
            _uiState.update { it.copy(equipments = list, isLoadingEquipments = false) }
        }
    }

    fun createServiceOrder(
        date: String = "",
        type: String = "MANUTENÇÃO CORRETIVA CONTRATO",
        clientId: String,
        clientName: String,
        addressId: String,
        addressStreet: String,
        equipmentId: String?,
        equipmentName: String?,
        tech2Name: String? = null,
        description: String,
        diagnosis: String? = null,
        solution: String? = null,
        fiscalName: String? = null,
        fiscalRegistration: String? = null,
        signaturePath: String? = null,
        signatureBase64: String? = null,
        isFinalized: Boolean = false,
        onSuccess: (orderId: String) -> Unit,
        onError: (message: String) -> Unit
    ) {
        viewModelScope.launch {
            try {
                val todayStr = SimpleDateFormat("yyyy-MM-dd", Locale.getDefault()).format(Date())
                val effectiveDate = date.ifBlank { todayStr }
                val params = CreateServiceOrderParams(
                    plannedDate = effectiveDate,
                    type = type,
                    clientId = clientId,
                    clientName = clientName,
                    addressId = addressId,
                    addressStreet = addressStreet,
                    equipmentId = equipmentId,
                    equipmentName = equipmentName,
                    technicianId = currentUser.uid,
                    technicianName = currentUser.name,
                    technician2Name = tech2Name,
                    description = description.ifBlank { "Atendimento / Chamado de Ordem de Serviço" },
                    diagnosis = diagnosis,
                    solution = solution,
                    fiscalName = fiscalName,
                    fiscalRegistration = fiscalRegistration,
                    signaturePath = signaturePath,
                    signatureBase64 = signatureBase64,
                    isFinalized = isFinalized
                )

                val created = repository.createServiceOrder(params)
                closeCreateModal()
                onSuccess(created.id)
            } catch (e: Exception) {
                onError(e.message ?: "Erro ao criar Ordem de Serviço")
            }
        }
    }

    fun triggerSync() {
        viewModelScope.launch {
            _uiState.update { it.copy(isSyncing = true) }
            val todayStr = SimpleDateFormat("yyyy-MM-dd", Locale.getDefault()).format(Date())
            repository.syncDailyItinerary(
                technicianName = currentUser.name,
                technicianId = currentUser.uid,
                targetDate = todayStr
            )
            var (scheduledClients, scheduledAddresses) = repository.getScheduledClientsAndAddressesForTechnician(
                technicianName = currentUser.name,
                technicianId = currentUser.uid,
                date = todayStr
            )
            if (scheduledClients.isEmpty() || scheduledAddresses.isEmpty()) {
                val available = repository.getAvailableClientsAndAddresses()
                if (scheduledClients.isEmpty()) scheduledClients = available.first
                if (scheduledAddresses.isEmpty()) scheduledAddresses = available.second
            }
            val techs = repository.getAllTechnicians()
            SyncWorker.triggerImmediateSync(getApplication())
            _uiState.update {
                it.copy(
                    clients = scheduledClients,
                    addresses = scheduledAddresses,
                    technicians = techs,
                    isSyncing = false
                )
            }
        }
    }
}
