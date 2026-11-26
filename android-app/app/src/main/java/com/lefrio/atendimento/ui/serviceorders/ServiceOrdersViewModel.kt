package com.lefrio.atendimento.ui.serviceorders

import android.app.Application
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import com.lefrio.atendimento.data.auth.TechnicianUser
import com.lefrio.atendimento.data.local.LocalServiceOrderDraft
import com.lefrio.atendimento.data.local.ServiceOrderDraftStorage
import com.lefrio.atendimento.data.local.entity.ServiceOrderEntity
import com.lefrio.atendimento.data.local.entity.TechnicianEntity
import com.lefrio.atendimento.data.repository.*
import com.lefrio.atendimento.data.sync.FirebaseSyncManager
import com.lefrio.atendimento.data.sync.SyncWorker
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.*
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import java.text.SimpleDateFormat
import java.util.*

enum class OSFilterTab {
    ALL,
    DRAFTS,
    OPEN,
    IN_PROGRESS,
    FINISHED
}

data class ServiceOrdersUiState(
    val orders: List<ServiceOrderEntity> = emptyList(),
    val filteredOrders: List<ServiceOrderEntity> = emptyList(),
    val drafts: List<LocalServiceOrderDraft> = emptyList(),
    val filteredDrafts: List<LocalServiceOrderDraft> = emptyList(),
    val draftsCount: Int = 0,
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
    private val draftStorage = ServiceOrderDraftStorage(application)
    private val _uiState = MutableStateFlow(ServiceOrdersUiState())
    val uiState: StateFlow<ServiceOrdersUiState> = _uiState.asStateFlow()

    init {
        refreshDrafts()
        loadData()
        triggerSync(forceRefresh = false)
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
                updateFilteredList(
                    orders = myOrdersForToday,
                    drafts = _uiState.value.drafts,
                    tab = _uiState.value.selectedTab,
                    query = _uiState.value.searchQuery
                )
            }
        }
    }

    fun refreshDrafts() {
        viewModelScope.launch {
            val activeDrafts = withContext(Dispatchers.IO) {
                draftStorage.getActiveDrafts(
                    technicianId = currentUser.uid,
                    technicianName = currentUser.name
                )
            }
            updateFilteredList(
                orders = _uiState.value.orders,
                drafts = activeDrafts,
                tab = _uiState.value.selectedTab,
                query = _uiState.value.searchQuery
            )
        }
    }

    fun saveOrderDraft(
        existingDraftId: String? = null,
        clientId: String,
        clientName: String,
        addressId: String,
        addressStreet: String,
        equipmentId: String,
        equipmentName: String,
        equipmentDisplay: String,
        equipmentBrand: String,
        equipmentBtus: String,
        equipmentSector: String,
        description: String,
        diagnosis: String,
        solution: String,
        technicalReport: String,
        fiscalName: String,
        fiscalRegistration: String,
        fiscalRole: String,
        fiscalContact: String,
        photoPaths: List<String>,
        onSaved: (LocalServiceOrderDraft) -> Unit = {},
        onError: (String) -> Unit = {}
    ) {
        viewModelScope.launch {
            try {
                val now = System.currentTimeMillis()
                val draftToSave = LocalServiceOrderDraft(
                    id = existingDraftId?.takeIf { it.isNotBlank() }
                        ?: "DRAFT_${now}_${UUID.randomUUID().toString().take(6)}",
                    technicianId = currentUser.uid,
                    technicianName = currentUser.name,
                    clientId = clientId,
                    clientName = clientName,
                    addressId = addressId,
                    addressStreet = addressStreet,
                    equipmentId = equipmentId,
                    equipmentName = equipmentName,
                    equipmentDisplay = equipmentDisplay,
                    equipmentBrand = equipmentBrand,
                    equipmentBtus = equipmentBtus,
                    equipmentSector = equipmentSector,
                    description = description,
                    diagnosis = diagnosis,
                    solution = solution,
                    technicalReport = technicalReport,
                    fiscalName = fiscalName,
                    fiscalRegistration = fiscalRegistration,
                    fiscalRole = fiscalRole,
                    fiscalContact = fiscalContact,
                    photoPaths = photoPaths,
                    createdAtMillis = now,
                    updatedAtMillis = now,
                    expiresAtMillis = now + ServiceOrderDraftStorage.RETENTION_MILLIS
                )
                val saved = withContext(Dispatchers.IO) {
                    draftStorage.saveDraft(draftToSave)
                }
                val activeDrafts = withContext(Dispatchers.IO) {
                    draftStorage.getActiveDrafts(
                        technicianId = currentUser.uid,
                        technicianName = currentUser.name
                    )
                }
                updateFilteredList(
                    orders = _uiState.value.orders,
                    drafts = activeDrafts,
                    tab = _uiState.value.selectedTab,
                    query = _uiState.value.searchQuery
                )
                onSaved(saved)
            } catch (e: Exception) {
                onError(e.message ?: "Não foi possível salvar a O.S. na memória do dispositivo.")
            }
        }
    }

    fun deleteOrderDraft(draftId: String) {
        viewModelScope.launch {
            val activeDrafts = withContext(Dispatchers.IO) {
                draftStorage.deleteDraft(draftId)
                draftStorage.getActiveDrafts(
                    technicianId = currentUser.uid,
                    technicianName = currentUser.name
                )
            }
            updateFilteredList(
                orders = _uiState.value.orders,
                drafts = activeDrafts,
                tab = _uiState.value.selectedTab,
                query = _uiState.value.searchQuery
            )
        }
    }

    fun loadData() {
        viewModelScope.launch {
            _uiState.update { it.copy(isLoading = true) }
            try {
                refreshDrafts()
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
        updateFilteredList(
            orders = _uiState.value.orders,
            drafts = _uiState.value.drafts,
            tab = tab,
            query = _uiState.value.searchQuery
        )
    }

    fun setSearchQuery(query: String) {
        _uiState.update { it.copy(searchQuery = query) }
        updateFilteredList(
            orders = _uiState.value.orders,
            drafts = _uiState.value.drafts,
            tab = _uiState.value.selectedTab,
            query = query
        )
    }

    private fun updateFilteredList(
        orders: List<ServiceOrderEntity>,
        drafts: List<LocalServiceOrderDraft> = _uiState.value.drafts,
        tab: OSFilterTab,
        query: String
    ) {
        val total = orders.size
        val open = orders.count { it.status == "aberta" }
        val inProg = orders.count { it.status == "em_andamento" }
        val fin = orders.count { it.status == "finalizada" || it.status == "pre_finalizada" }

        val tabFiltered = when (tab) {
            OSFilterTab.ALL -> orders
            OSFilterTab.DRAFTS -> emptyList()
            OSFilterTab.OPEN -> orders.filter { it.status == "aberta" }
            OSFilterTab.IN_PROGRESS -> orders.filter { it.status == "em_andamento" }
            OSFilterTab.FINISHED -> orders.filter { it.status == "finalizada" || it.status == "pre_finalizada" }
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

        val finalDrafts = if (q.isBlank()) {
            drafts
        } else {
            drafts.filter { draft ->
                draft.clientName.lowercase().contains(q) ||
                draft.addressStreet.lowercase().contains(q) ||
                draft.equipmentDisplay.lowercase().contains(q) ||
                draft.equipmentName.lowercase().contains(q) ||
                draft.equipmentSector.lowercase().contains(q) ||
                draft.description.lowercase().contains(q) ||
                draft.diagnosis.lowercase().contains(q) ||
                draft.solution.lowercase().contains(q) ||
                draft.fiscalName.lowercase().contains(q)
            }
        }

        _uiState.update {
            it.copy(
                orders = orders,
                filteredOrders = finalFiltered,
                drafts = drafts,
                filteredDrafts = finalDrafts,
                draftsCount = drafts.size,
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
        equipmentBrand: String? = null,
        equipmentBtus: String? = null,
        equipmentSector: String? = null,
        tech2Name: String? = null,
        description: String,
        diagnosis: String? = null,
        solution: String? = null,
        technicalReport: String? = null,
        fiscalName: String? = null,
        fiscalRegistration: String? = null,
        fiscalRole: String? = null,
        fiscalContact: String? = null,
        signaturePath: String? = null,
        signatureBase64: String? = null,
        photoPaths: List<String> = emptyList(),
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
                    equipmentBrand = equipmentBrand,
                    equipmentBtus = equipmentBtus,
                    equipmentSector = equipmentSector,
                    technicianId = currentUser.uid,
                    technicianName = currentUser.name,
                    technician2Name = tech2Name,
                    description = description.ifBlank { "Atendimento / Chamado de Ordem de Serviço" },
                    diagnosis = diagnosis,
                    solution = solution,
                    technicalReport = technicalReport,
                    fiscalName = fiscalName,
                    fiscalRegistration = fiscalRegistration,
                    fiscalRole = fiscalRole,
                    fiscalContact = fiscalContact,
                    signaturePath = signaturePath,
                    signatureBase64 = signatureBase64,
                    photoPaths = photoPaths,
                    isFinalized = isFinalized
                )

                val created = repository.createServiceOrder(params)
                closeCreateModal()
                onSuccess(created.id)
                // Envio imediato assíncrono (sem travar a UI) para que a O.S. apareça no painel administrativo em segundos quando houver internet
                viewModelScope.launch(Dispatchers.IO) {
                    try {
                        FirebaseSyncManager(getApplication()).processPendingSyncQueue(ignoreBackoff = true)
                    } catch (_: Exception) {}
                }
            } catch (e: Exception) {
                onError(e.message ?: "Erro ao criar Ordem de Serviço")
            }
        }
    }

    fun triggerSync(forceRefresh: Boolean = true) {
        viewModelScope.launch {
            _uiState.update { it.copy(isSyncing = true) }
            try {
                // Drena pendências locais antes de baixar do servidor para evitar sobrescrita ou atraso no envio
                kotlinx.coroutines.withContext(Dispatchers.IO) {
                    FirebaseSyncManager(getApplication()).processPendingSyncQueue(ignoreBackoff = forceRefresh)
                }
            } catch (_: Exception) {}

            val todayStr = SimpleDateFormat("yyyy-MM-dd", Locale.getDefault()).format(Date())
            repository.syncDailyItinerary(
                technicianName = currentUser.name,
                technicianId = currentUser.uid,
                targetDate = todayStr,
                forceRefresh = forceRefresh
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
            if (forceRefresh) {
                SyncWorker.triggerImmediateSync(getApplication())
            }
            _uiState.update {
                it.copy(
                    clients = scheduledClients,
                    addresses = scheduledAddresses,
                    technicians = techs,
                    isSyncing = false
                )
            }
            refreshDrafts()
        }
    }
}
