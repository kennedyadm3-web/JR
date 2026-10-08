package com.lefrio.atendimento.ui.auth

import android.app.Application
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import com.lefrio.atendimento.data.auth.AuthRepository
import com.lefrio.atendimento.data.auth.TechnicianUser
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

sealed class AuthUiState {
    object Idle : AuthUiState()
    object Loading : AuthUiState()
    data class Success(val user: TechnicianUser) : AuthUiState()
    data class Error(val message: String) : AuthUiState()
}

class AuthViewModel(application: Application) : AndroidViewModel(application) {

    private val authRepo = AuthRepository(application)

    private val _uiState = MutableStateFlow<AuthUiState>(AuthUiState.Idle)
    val uiState: StateFlow<AuthUiState> = _uiState.asStateFlow()

    init {
        // Verifica se já existe sessão salva
        val currentUser = authRepo.getCurrentUser()
        if (currentUser != null) {
            _uiState.value = AuthUiState.Success(currentUser)
        }
    }

    fun login(email: String, pass: String) {
        if (email.isBlank() || pass.isBlank()) {
            _uiState.value = AuthUiState.Error("Preencha o e-mail e a senha.")
            return
        }

        viewModelScope.launch {
            _uiState.value = AuthUiState.Loading
            val result = authRepo.signIn(email, pass)
            result.onSuccess { user ->
                _uiState.value = AuthUiState.Success(user)
            }.onFailure { ex ->
                _uiState.value = AuthUiState.Error(ex.message ?: "Erro ao entrar.")
            }
        }
    }

    fun logout() {
        authRepo.signOut()
        _uiState.value = AuthUiState.Idle
    }
}
