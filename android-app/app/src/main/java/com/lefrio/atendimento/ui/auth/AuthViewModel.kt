package com.lefrio.atendimento.ui.auth

import android.app.Application
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import com.lefrio.atendimento.data.auth.AuthRepository
import com.lefrio.atendimento.data.auth.TechnicianUser
import com.lefrio.atendimento.data.local.entity.TechnicianEntity
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

sealed class AuthUiState {
    object Idle : AuthUiState()
    object Loading : AuthUiState()
    data class NeedsTechnicianSelect(
        val technicians: List<TechnicianEntity>,
        val pinError: String? = null
    ) : AuthUiState()
    data class Success(val user: TechnicianUser) : AuthUiState()
    data class Error(val message: String) : AuthUiState()
}

class AuthViewModel(application: Application) : AndroidViewModel(application) {

    private val authRepo = AuthRepository(application)

    private val _uiState = MutableStateFlow<AuthUiState>(AuthUiState.Idle)
    val uiState: StateFlow<AuthUiState> = _uiState.asStateFlow()

    init {
        checkSession()
    }

    fun checkSession() {
        viewModelScope.launch {
            if (authRepo.isBaseAccountLoggedIn()) {
                val selectedTech = authRepo.getSelectedTechnician()
                if (selectedTech != null) {
                    _uiState.value = AuthUiState.Success(selectedTech)
                } else {
                    val techs = authRepo.fetchTechnicians()
                    _uiState.value = AuthUiState.NeedsTechnicianSelect(technicians = techs)
                }
            } else {
                _uiState.value = AuthUiState.Idle
            }
        }
    }

    fun loginBaseAccount(emailOrUsername: String, pass: String) {
        if (emailOrUsername.isBlank() || pass.isBlank()) {
            _uiState.value = AuthUiState.Error("Preencha o usuário e a senha.")
            return
        }

        viewModelScope.launch {
            _uiState.value = AuthUiState.Loading
            val result = authRepo.signInBaseAccount(emailOrUsername, pass)
            result.onSuccess {
                // Após o login com a conta base, OBRIGATORIAMENTE mostra a tela de selecionar o técnico e digitar o PIN
                val techs = authRepo.fetchTechnicians()
                _uiState.value = AuthUiState.NeedsTechnicianSelect(technicians = techs)
            }.onFailure { ex ->
                _uiState.value = AuthUiState.Error(ex.message ?: "Erro ao entrar.")
            }
        }
    }

    fun validatePin(techId: String, pin: String) {
        val currentState = _uiState.value
        val techList = if (currentState is AuthUiState.NeedsTechnicianSelect) currentState.technicians else emptyList()

        if (techId.isBlank()) {
            _uiState.value = AuthUiState.NeedsTechnicianSelect(
                technicians = techList,
                pinError = "Selecione seu nome para continuar."
            )
            return
        }

        if (pin.isBlank() || pin.length < 4) {
            _uiState.value = AuthUiState.NeedsTechnicianSelect(
                technicians = techList,
                pinError = "Digite seu PIN de 4 dígitos."
            )
            return
        }

        viewModelScope.launch {
            val result = authRepo.authenticateTechnicianPin(techId, pin)
            result.onSuccess { techUser ->
                _uiState.value = AuthUiState.Success(techUser)
            }.onFailure { ex ->
                _uiState.value = AuthUiState.NeedsTechnicianSelect(
                    technicians = techList,
                    pinError = ex.message ?: "PIN incorreto. Tente novamente."
                )
            }
        }
    }

    fun switchTechnician() {
        viewModelScope.launch {
            authRepo.clearSelectedTechnician()
            val techs = authRepo.fetchTechnicians()
            _uiState.value = AuthUiState.NeedsTechnicianSelect(technicians = techs)
        }
    }

    fun logout() {
        authRepo.logoutFull()
        _uiState.value = AuthUiState.Idle
    }
}
