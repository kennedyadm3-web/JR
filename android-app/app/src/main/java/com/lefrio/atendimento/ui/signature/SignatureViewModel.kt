package com.lefrio.atendimento.ui.signature

import android.app.Application
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import com.lefrio.atendimento.data.local.entity.ServiceOrderEntity
import com.lefrio.atendimento.data.repository.ServiceOrderRepository
import com.lefrio.atendimento.ui.signature.components.SignaturePath
import com.lefrio.atendimento.ui.signature.components.saveSignatureToLocalFile
import com.lefrio.atendimento.util.GpsAuditManager
import com.lefrio.atendimento.util.GpsLocationResult
import kotlinx.coroutines.flow.*
import kotlinx.coroutines.launch
import java.text.SimpleDateFormat
import java.util.*

sealed class SignatureUiState {
    object Idle : SignatureUiState()
    object Finalizing : SignatureUiState()
    data class Success(val orderId: String, val completionDate: String) : SignatureUiState()
    data class Error(val message: String) : SignatureUiState()
}

class SignatureViewModel(
    application: Application,
    val orderId: String
) : AndroidViewModel(application) {

    private val repository = ServiceOrderRepository(application)
    private val gpsManager = GpsAuditManager(application)

    private val _order = MutableStateFlow<ServiceOrderEntity?>(null)
    val order: StateFlow<ServiceOrderEntity?> = _order.asStateFlow()

    private val _uiState = MutableStateFlow<SignatureUiState>(SignatureUiState.Idle)
    val uiState: StateFlow<SignatureUiState> = _uiState.asStateFlow()

    private val _gpsLocation = MutableStateFlow<GpsLocationResult?>(null)
    val gpsLocation: StateFlow<GpsLocationResult?> = _gpsLocation.asStateFlow()

    init {
        viewModelScope.launch {
            repository.getOrderById(orderId).collect {
                _order.value = it
            }
        }

        // Inicia captura prévia do GPS para garantir resposta instantânea
        viewModelScope.launch {
            val loc = gpsManager.getCurrentLocation()
            _gpsLocation.value = loc
        }
    }

    fun finalizeOrder(
        signeeName: String,
        signeeDoc: String,
        signaturePaths: List<SignaturePath>
    ) {
        if (signeeName.isBlank()) {
            _uiState.value = SignatureUiState.Error("Informe o nome do recebedor.")
            return
        }

        if (signeeDoc.isBlank()) {
            _uiState.value = SignatureUiState.Error("Informe o documento (RG ou CPF) do recebedor.")
            return
        }

        if (signaturePaths.isEmpty()) {
            _uiState.value = SignatureUiState.Error("Por favor, colete a assinatura do cliente.")
            return
        }

        viewModelScope.launch {
            _uiState.value = SignatureUiState.Finalizing

            try {
                // 1. Garante coordenadas de GPS atualizadas no momento da assinatura
                val loc = gpsManager.getCurrentLocation()
                val latitude = if (loc.isCaptured) loc.latitude else 0.0
                val longitude = if (loc.isCaptured) loc.longitude else 0.0
                val accuracy = if (loc.isCaptured) loc.accuracy else 0f

                // 2. Salva arquivo de assinatura local
                val signatureFile = saveSignatureToLocalFile(
                    context = getApplication(),
                    paths = signaturePaths,
                    orderId = orderId
                )

                val nowStr = SimpleDateFormat("dd/MM/yyyy HH:mm:ss", Locale.getDefault()).format(Date())

                // 3. Grava no Room e enfileira para sincronização
                repository.finalizeServiceOrder(
                    orderId = orderId,
                    signeeName = signeeName.trim(),
                    signeeDoc = signeeDoc.trim(),
                    signatureDate = nowStr,
                    signatureFilePath = signatureFile.absolutePath,
                    completionDate = nowStr,
                    latitude = latitude,
                    longitude = longitude,
                    accuracy = accuracy
                )

                _uiState.value = SignatureUiState.Success(orderId, nowStr)
            } catch (e: Exception) {
                _uiState.value = SignatureUiState.Error(e.message ?: "Erro ao finalizar atendimento.")
            }
        }
    }
}
