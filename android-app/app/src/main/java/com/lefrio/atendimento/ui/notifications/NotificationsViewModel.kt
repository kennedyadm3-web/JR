package com.lefrio.atendimento.ui.notifications

import android.app.Application
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import com.lefrio.atendimento.data.local.entity.TechNotificationEntity
import com.lefrio.atendimento.data.repository.ServiceOrderRepository
import kotlinx.coroutines.flow.*
import kotlinx.coroutines.launch

data class NotificationsUiState(
    val notifications: List<TechNotificationEntity> = emptyList(),
    val unreadCount: Int = 0,
    val isLoading: Boolean = false
)

class NotificationsViewModel(application: Application) : AndroidViewModel(application) {

    private val repository = ServiceOrderRepository(application)

    private val _uiState = MutableStateFlow(NotificationsUiState())
    val uiState: StateFlow<NotificationsUiState> = _uiState.asStateFlow()

    init {
        loadNotifications()
        seedInitialWelcomeNotification()
    }

    private fun loadNotifications() {
        viewModelScope.launch {
            repository.getAllNotifications().collect { list: List<TechNotificationEntity> ->
                val unread = list.count { !it.isRead }
                _uiState.update { it.copy(notifications = list, unreadCount = unread) }
            }
        }
    }

    private fun seedInitialWelcomeNotification() {
        viewModelScope.launch {
            val currentList = repository.getAllNotifications().first()
            if (currentList.isEmpty()) {
                repository.addNotification(
                    TechNotificationEntity(
                        id = "NOTIF_WELCOME_1",
                        title = "Central de Atendimento LeFrio Conectada",
                        message = "Bem-vindo ao aplicativo operacional LeFrio! Seus atendimentos do dia, fotos e comprovantes são salvos localmente e sincronizados automaticamente.",
                        type = "system",
                        priority = "normal",
                        isRead = false,
                        timestamp = System.currentTimeMillis()
                    )
                )
            }
        }
    }

    fun markAsRead(id: String) {
        viewModelScope.launch {
            repository.markNotificationAsRead(id)
        }
    }

    fun markAllAsRead() {
        viewModelScope.launch {
            repository.markAllNotificationsAsRead()
        }
    }
}
