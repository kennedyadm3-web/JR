package com.lefrio.atendimento.ui.order

import android.app.Application
import android.content.Context
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import com.lefrio.atendimento.data.local.entity.EquipmentChecklistEntity
import com.lefrio.atendimento.data.local.entity.ServiceOrderEntity
import com.lefrio.atendimento.data.local.entity.isRemovalRequested
import com.lefrio.atendimento.data.repository.ServiceOrderRepository
import com.lefrio.atendimento.ui.signature.components.SignaturePath
import com.lefrio.atendimento.ui.signature.components.saveSignatureToLocalFile
import com.lefrio.atendimento.util.GpsAuditManager
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.*
import kotlinx.coroutines.launch
import org.json.JSONArray
import java.text.SimpleDateFormat
import java.util.*

data class OrderDetailUiState(
    val order: ServiceOrderEntity? = null,
    val checklistItems: List<EquipmentChecklistEntity> = emptyList(),
    val completedCount: Int = 0,
    val totalCount: Int = 0,
    val progressPercentage: Float = 0f,
    val fiscalName: String = "",
    val fiscalDoc: String = "",
    val routeNotes: String = "",
    val otherPhotos: List<String> = emptyList(),
    val isSavingEquipment: Boolean = false,
    val hasSignature: Boolean = false,
    val isFinalizing: Boolean = false,
    val finalizeSuccess: Boolean = false,
    val finalizeSyncedImmediately: Boolean = false,
    val isLoading: Boolean = true,
    val infoMessage: String? = null,
    val errorMessage: String? = null
)

class OrderDetailViewModel(
    application: Application,
    private val orderId: String
) : AndroidViewModel(application) {

    private val repository = ServiceOrderRepository(application)

    private val _uiState = MutableStateFlow(OrderDetailUiState())
    val uiState: StateFlow<OrderDetailUiState> = _uiState.asStateFlow()
    private var routeNotesSaveJob: Job? = null
    private var routeNotesInitialized = false

    companion object {
        private const val LEGACY_PMOC_DEFAULT_NOTE = "Manutenção Preventiva Periódica PMOC - Higienização, Testes e Revisão"
    }

    init {
        loadOrderDetails()
    }

    private fun loadOrderDetails() {
        val initialOtherPhotos = repository.getOtherPhotos(orderId)
        _uiState.update { it.copy(otherPhotos = initialOtherPhotos) }

        viewModelScope.launch {
            repository.getOrderById(orderId).collect { orderEntity ->
                val rawNote = orderEntity?.generalNotes?.trim() ?: ""
                val cleanNote = if (rawNote == LEGACY_PMOC_DEFAULT_NOTE) "" else rawNote

                _uiState.update { state ->
                    val resolvedRouteNotes = if (!routeNotesInitialized) {
                        if (orderEntity != null) routeNotesInitialized = true
                        cleanNote
                    } else {
                        state.routeNotes
                    }
                    state.copy(
                        order = orderEntity,
                        fiscalName = state.fiscalName.ifBlank { orderEntity?.clientRepresentative ?: "" },
                        fiscalDoc = state.fiscalDoc.ifBlank { orderEntity?.clientSigneeDoc ?: "" },
                        routeNotes = resolvedRouteNotes,
                        hasSignature = state.hasSignature || (orderEntity?.clientSignaturePath != null),
                        isLoading = false
                    )
                }
            }
        }

        viewModelScope.launch {
            repository.getChecklistForOrder(orderId).collect { items ->
                val completed = items.count { it.isChecked || it.isSkipped }
                val total = items.size
                val percentage = if (total > 0) completed.toFloat() / total.toFloat() else 0f

                _uiState.update {
                    it.copy(
                        checklistItems = items,
                        completedCount = completed,
                        totalCount = total,
                        progressPercentage = percentage
                    )
                }
            }
        }
    }

    fun updateFiscalName(name: String) {
        _uiState.update { it.copy(fiscalName = name) }
        viewModelScope.launch {
            repository.saveFiscalDraft(orderId, name, _uiState.value.fiscalDoc)
        }
    }

    fun updateFiscalDoc(doc: String) {
        _uiState.update { it.copy(fiscalDoc = doc) }
        viewModelScope.launch {
            repository.saveFiscalDraft(orderId, _uiState.value.fiscalName, doc)
        }
    }

    fun updateHasSignature(hasSig: Boolean) {
        _uiState.update { it.copy(hasSignature = hasSig) }
    }

    fun updateRouteNotes(notes: String) {
        routeNotesInitialized = true
        _uiState.update { it.copy(routeNotes = notes) }
        routeNotesSaveJob?.cancel()
        routeNotesSaveJob = viewModelScope.launch {
            delay(500)
            repository.saveGeneralNotes(orderId, notes)
        }
    }

    fun attachOtherPhoto(photoPath: String) {
        val current = _uiState.value.otherPhotos
        if (current.size >= 4) {
            _uiState.update { it.copy(errorMessage = "Você pode adicionar no máximo 4 fotos de observação.") }
            return
        }
        val updated = (current + photoPath).take(4)
        _uiState.update { it.copy(otherPhotos = updated, infoMessage = "Foto de observação salva no aparelho!") }
        viewModelScope.launch {
            repository.saveOtherPhotos(orderId, updated)
        }
    }

    fun removeOtherPhoto(photoPath: String) {
        val updated = _uiState.value.otherPhotos.filterNot { it == photoPath }
        _uiState.update { it.copy(otherPhotos = updated) }
        viewModelScope.launch {
            repository.saveOtherPhotos(orderId, updated)
        }
    }

    fun addNewEquipment(
        sector: String,
        typeName: String,
        brand: String,
        btus: String,
        patrimony: String,
        onAdded: () -> Unit = {}
    ) {
        val cleanSector = sector.trim()
        if (cleanSector.isBlank()) {
            _uiState.update { it.copy(errorMessage = "Informe o Nome Completo do Setor da máquina.") }
            return
        }
        val currentOrder = _uiState.value.order
        if (currentOrder == null) {
            _uiState.update { it.copy(errorMessage = "Atendimento ainda carregando. Tente novamente.") }
            return
        }

        viewModelScope.launch {
            _uiState.update { it.copy(isSavingEquipment = true) }
            try {
                repository.addEquipmentToOrder(
                    orderId = orderId,
                    addressId = currentOrder.addressId,
                    sector = cleanSector,
                    name = typeName.trim().ifBlank { "SPLIT HI-WALL" },
                    brand = brand.trim().ifBlank { "Não informada" },
                    btus = btus.trim().ifBlank { "12000" },
                    patrimony = patrimony.trim()
                )
                _uiState.update {
                    it.copy(
                        isSavingEquipment = false,
                        infoMessage = "Nova máquina salva! O administrativo homologará junto com a folha."
                    )
                }
                onAdded()
            } catch (t: Throwable) {
                _uiState.update {
                    it.copy(
                        isSavingEquipment = false,
                        errorMessage = "Erro ao adicionar máquina: ${t.message}"
                    )
                }
            }
        }
    }

    fun toggleRemoveEquipment(item: EquipmentChecklistEntity) {
        viewModelScope.launch {
            repository.toggleEquipmentRemoval(item)
            val msg = if (item.isRemovalRequested()) {
                "Solicitação de remoção desfeita."
            } else {
                "Remoção solicitada para esta máquina (será confirmada pelo administrativo)."
            }
            _uiState.update { it.copy(infoMessage = msg) }
        }
    }

    fun clearErrorMessage() {
        _uiState.update { it.copy(errorMessage = null) }
    }

    fun clearInfoMessage() {
        _uiState.update { it.copy(infoMessage = null) }
    }

    /**
     * Finaliza o atendimento da folha inteira: grava assinatura digital, pega GPS e sincroniza.
     */
    fun finalizeOrder(
        context: Context,
        signaturePaths: List<SignaturePath>
    ) {
        val currentState = _uiState.value
        val name = currentState.fiscalName.trim()
        val doc = currentState.fiscalDoc.trim()

        if (name.isBlank()) {
            _uiState.update { it.copy(errorMessage = "Informe o Nome do Responsável / Fiscal do Cliente.") }
            return
        }
        if (doc.isBlank()) {
            _uiState.update { it.copy(errorMessage = "Informe a Matrícula ou CPF do Responsável / Fiscal.") }
            return
        }
        if (signaturePaths.isEmpty() && currentState.order?.clientSignaturePath == null) {
            _uiState.update { it.copy(errorMessage = "Colha a Assinatura Digital do Responsável na área de assinatura.") }
            return
        }
        if (currentState.completedCount == 0) {
            _uiState.update { it.copy(errorMessage = "Atenda ao menos 1 máquina do checklist antes de finalizar.") }
            return
        }

        viewModelScope.launch {
            _uiState.update { it.copy(isFinalizing = true) }
            try {
                // 1. Obtém localização GPS de auditoria
                val gpsManager = GpsAuditManager(getApplication())
                val loc = gpsManager.getCurrentLocation()
                val latitude = if (loc.isCaptured) loc.latitude else 0.0
                val longitude = if (loc.isCaptured) loc.longitude else 0.0
                val accuracy = if (loc.isCaptured) loc.accuracy else 0f

                // 2. Salva arquivo de assinatura digital local
                val signatureFilePath = if (signaturePaths.isNotEmpty()) {
                    saveSignatureToLocalFile(
                        context = context,
                        paths = signaturePaths,
                        orderId = orderId
                    ).absolutePath
                } else {
                    currentState.order?.clientSignaturePath ?: ""
                }

                val nowIso = SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", Locale.getDefault()).apply {
                    timeZone = TimeZone.getTimeZone("UTC")
                }.format(Date())

                val sigBase64 = if (signatureFilePath.isNotBlank()) {
                    com.lefrio.atendimento.ui.signature.components.convertFileToBase64(java.io.File(signatureFilePath))
                } else null

                // 3. Grava finalização no banco local Room e enfileira para sincronização
                routeNotesSaveJob?.cancel()
                val syncedNow = repository.finalizeServiceOrder(
                    orderId = orderId,
                    signeeName = name,
                    signeeDoc = doc,
                    signatureDate = nowIso,
                    signatureFilePath = signatureFilePath,
                    completionDate = nowIso,
                    latitude = latitude,
                    longitude = longitude,
                    accuracy = accuracy,
                    signatureBase64 = sigBase64,
                    checklistItems = currentState.checklistItems,
                    routeNotes = currentState.routeNotes,
                    otherPhotoPaths = currentState.otherPhotos
                )

                _uiState.update {
                    it.copy(
                        isFinalizing = false,
                        finalizeSuccess = true,
                        finalizeSyncedImmediately = syncedNow,
                        errorMessage = null
                    )
                }
            } catch (t: Throwable) {
                _uiState.update {
                    it.copy(
                        isFinalizing = false,
                        errorMessage = "Erro ao finalizar atendimento: ${t.message}"
                    )
                }
            }
        }
    }

    /**
     * Inicia o atendimento mudando o status para 'em_andamento'.
     */
    fun startService() {
        viewModelScope.launch {
            repository.updateOrderStatus(orderId, "em_andamento")
        }
    }

    /**
     * Alterna o atendimento rápido da máquina inteira (como no botão 'Atender' do PWA).
     */
    fun toggleAttendEquipment(item: EquipmentChecklistEntity) {
        val newChecked = !item.isChecked
        val currentPhotos = parsePhotoPaths(item.localPhotoPathsJson)
        val nowStr = SimpleDateFormat("dd/MM/yyyy HH:mm:ss", Locale.getDefault()).format(Date())
        
        viewModelScope.launch {
            repository.saveEquipmentChecklist(
                checklistId = item.id,
                orderId = item.orderId,
                equipmentId = item.equipmentId,
                isChecked = newChecked,
                isSkipped = false,
                notes = item.notes,
                justification = null,
                checkedAt = if (newChecked) nowStr else null,
                localPhotoPaths = currentPhotos
            )
        }
    }

    /**
     * Alterna o status de 'Pular' da máquina.
     */
    fun toggleSkipEquipment(item: EquipmentChecklistEntity, justification: String? = "Pular máquina") {
        val currentlySkippedOnly = item.isSkipped && !item.isRemovalRequested()
        val newSkipped = !currentlySkippedOnly
        val currentPhotos = parsePhotoPaths(item.localPhotoPathsJson)
        val nowStr = SimpleDateFormat("dd/MM/yyyy HH:mm:ss", Locale.getDefault()).format(Date())

        viewModelScope.launch {
            repository.saveEquipmentChecklist(
                checklistId = item.id,
                orderId = item.orderId,
                equipmentId = item.equipmentId,
                isChecked = false,
                isSkipped = newSkipped,
                notes = item.notes,
                justification = if (newSkipped) (justification ?: "Pular máquina") else null,
                checkedAt = if (newSkipped) nowStr else null,
                localPhotoPaths = currentPhotos
            )
        }
    }

    /**
     * Atualiza as observações da máquina mantendo o status.
     */
    fun updateEquipmentNotes(item: EquipmentChecklistEntity, notes: String) {
        val currentPhotos = parsePhotoPaths(item.localPhotoPathsJson)
        viewModelScope.launch {
            repository.saveEquipmentChecklist(
                checklistId = item.id,
                orderId = item.orderId,
                equipmentId = item.equipmentId,
                isChecked = item.isChecked,
                isSkipped = item.isSkipped,
                notes = notes,
                justification = item.justification,
                checkedAt = item.checkedAt,
                localPhotoPaths = currentPhotos
            )
        }
    }

    /**
     * Salva a inspeção de uma máquina no banco local e enfileira para sincronização.
     */
    fun saveInspection(
        item: EquipmentChecklistEntity,
        isChecked: Boolean,
        isSkipped: Boolean,
        notes: String,
        justification: String?,
        localPhotos: List<String>
    ) {
        viewModelScope.launch {
            val nowStr = SimpleDateFormat("dd/MM/yyyy HH:mm:ss", Locale.getDefault()).format(Date())
            repository.saveEquipmentChecklist(
                checklistId = item.id,
                orderId = item.orderId,
                equipmentId = item.equipmentId,
                isChecked = isChecked,
                isSkipped = isSkipped,
                notes = notes,
                justification = justification,
                checkedAt = nowStr,
                localPhotoPaths = localPhotos
            )
        }
    }

    /**
     * Anexa uma nova foto à lista de fotos locais do equipamento.
     */
    fun attachPhotoToEquipment(item: EquipmentChecklistEntity, photoPath: String) {
        val currentPhotos = parsePhotoPaths(item.localPhotoPathsJson).toMutableList()
        currentPhotos.add(photoPath)

        saveInspection(
            item = item,
            isChecked = true,
            isSkipped = false,
            notes = item.notes,
            justification = item.justification,
            localPhotos = currentPhotos
        )
    }

    /**
     * Remove uma foto da lista local do equipamento.
     */
    fun removePhotoFromEquipment(item: EquipmentChecklistEntity, photoPath: String) {
        val currentPhotos = parsePhotoPaths(item.localPhotoPathsJson).toMutableList()
        currentPhotos.remove(photoPath)

        saveInspection(
            item = item,
            isChecked = item.isChecked,
            isSkipped = item.isSkipped,
            notes = item.notes,
            justification = item.justification,
            localPhotos = currentPhotos
        )
    }

    fun parsePhotoPaths(json: String): List<String> {
        return try {
            val arr = JSONArray(json)
            val list = mutableListOf<String>()
            for (i in 0 until arr.length()) {
                list.add(arr.getString(i))
            }
            list
        } catch (e: Exception) {
            emptyList()
        }
    }
}
