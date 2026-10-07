package com.lefrio.atendimento.ui

import android.os.Bundle
import android.widget.Toast
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.viewModels
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.material3.Surface
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import com.lefrio.atendimento.ui.auth.AuthUiState
import com.lefrio.atendimento.ui.auth.AuthViewModel
import com.lefrio.atendimento.ui.auth.LoginScreen
import com.lefrio.atendimento.ui.dashboard.DashboardScreen
import com.lefrio.atendimento.ui.dashboard.DashboardViewModel
import com.lefrio.atendimento.ui.theme.LeFrioTheme

class MainActivity : ComponentActivity() {

    private val authViewModel: AuthViewModel by viewModels()
    private val dashboardViewModel: DashboardViewModel by viewModels()

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        setContent {
            LeFrioTheme {
                Surface(
                    modifier = Modifier.fillMaxSize(),
                    color = Color(0xFFF8FAFC)
                ) {
                    val authState by authViewModel.uiState.collectAsState()

                    when (val state = authState) {
                        is AuthUiState.Success -> {
                            DashboardScreen(
                                user = state.user,
                                viewModel = dashboardViewModel,
                                onOrderClick = { orderId ->
                                    // Ponto de entrada para o Dia 3 (Execução do Atendimento e Checklist)
                                    Toast.makeText(
                                        this,
                                        "Abrindo O.S. $orderId",
                                        Toast.LENGTH_SHORT
                                    ).show()
                                },
                                onLogoutClick = {
                                    authViewModel.logout()
                                }
                            )
                        }

                        else -> {
                            LoginScreen(
                                viewModel = authViewModel,
                                onLoginSuccess = { /* Estado gerenciado pelo AuthUiState.Success */ }
                            )
                        }
                    }
                }
            }
        }
    }
}
