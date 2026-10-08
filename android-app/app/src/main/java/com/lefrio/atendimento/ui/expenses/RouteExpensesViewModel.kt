package com.lefrio.atendimento.ui.expenses

import android.app.Application
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import com.lefrio.atendimento.data.auth.TechnicianUser
import com.lefrio.atendimento.data.local.entity.RouteExpenseEntity
import com.lefrio.atendimento.data.repository.ServiceOrderRepository
import kotlinx.coroutines.flow.*
import kotlinx.coroutines.launch
import java.text.SimpleDateFormat
import java.util.*

data class ExpensesUiState(
    val expenses: List<RouteExpenseEntity> = emptyList(),
    val totalAmount: Double = 0.0,
    val isLoading: Boolean = false,
    val successMessage: String? = null,
    val errorMessage: String? = null
)

class RouteExpensesViewModel(
    application: Application,
    private val currentUser: TechnicianUser
) : AndroidViewModel(application) {

    private val repository = ServiceOrderRepository(application)

    private val _uiState = MutableStateFlow(ExpensesUiState())
    val uiState: StateFlow<ExpensesUiState> = _uiState.asStateFlow()

    init {
        loadExpenses()
    }

    private fun loadExpenses() {
        viewModelScope.launch {
            repository.getExpensesByTechnician(currentUser.uid).collect { list: List<RouteExpenseEntity> ->
                val total = list.sumOf { it.amount }
                _uiState.update { it.copy(expenses = list, totalAmount = total) }
            }
        }
    }

    fun addExpense(
        category: String,
        amount: Double,
        description: String,
        orderId: String? = null,
        photoPath: String? = null
    ) {
        if (amount <= 0.0) {
            _uiState.update { it.copy(errorMessage = "Informe um valor válido maior que zero.") }
            return
        }

        if (description.isBlank()) {
            _uiState.update { it.copy(errorMessage = "Informe a descrição ou estabelecimento.") }
            return
        }

        viewModelScope.launch {
            try {
                val nowStr = SimpleDateFormat("dd/MM/yyyy", Locale.getDefault()).format(Date())
                val newExpense = RouteExpenseEntity(
                    id = "EXP_${System.currentTimeMillis()}_${UUID.randomUUID().toString().take(6)}",
                    technicianId = currentUser.uid,
                    technicianName = currentUser.name,
                    category = category,
                    amount = amount,
                    description = description.trim(),
                    date = nowStr,
                    receiptLocalPhotoPath = photoPath,
                    orderId = orderId?.takeIf { it.isNotBlank() },
                    status = "pendente",
                    isSynced = false
                )

                repository.saveRouteExpense(newExpense)
                _uiState.update { it.copy(successMessage = "Despesa lançada com sucesso!", errorMessage = null) }
            } catch (e: Exception) {
                _uiState.update { it.copy(errorMessage = e.message ?: "Erro ao salvar despesa.") }
            }
        }
    }

    fun deleteExpense(id: String) {
        viewModelScope.launch {
            repository.deleteRouteExpense(id)
        }
    }

    fun clearMessages() {
        _uiState.update { it.copy(successMessage = null, errorMessage = null) }
    }
}
