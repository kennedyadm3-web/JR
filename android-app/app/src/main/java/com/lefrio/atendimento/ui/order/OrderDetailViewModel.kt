package com.lefrio.atendimento.ui.order

import android.app.Application
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import com.lefrio.atendimento.data.local.entity.EquipmentChecklistEntity
import com.lefrio.atendimento.data.local.entity.ServiceOrderEntity
import com.lefrio.atendimento.data.repository.ServiceOrderRepository
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
    val isLoading: Boolean = true,
    val errorMessage: String? = null
)

class OrderDetailViewModel(
    application: Application,
    private val orderId: String
) : AndroidViewModel(application) {

    private val repository = ServiceOrderRepository(application)

    private val _uiState = MutableStateFlow(OrderDetailUiState())
    val uiState: StateFlow<OrderDetailUiState> = _uiState.asStateFlow()

    init {
        loadOrderDetails()
    }

    private fun loadOrderDetails() {
        viewModelScope.launch {
            repository.getOrderById(orderId).collect { orderEntity ->
                _uiState.update { it.copy(order = orderEntity, isLoading = false) }
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

    /**
     * Inicia o atendimento mudando o status para 'em_andamento'.
     */
    fun startService() {
        viewModelScope.launch {
            repository.updateOrderStatus(orderId, "em_andamento")
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
