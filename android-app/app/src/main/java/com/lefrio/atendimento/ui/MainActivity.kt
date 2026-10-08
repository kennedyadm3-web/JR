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
import com.lefrio.atendimento.ui.components.UpdateDialog
import com.lefrio.atendimento.ui.dashboard.DashboardScreen
import com.lefrio.atendimento.ui.dashboard.DashboardViewModel
import com.lefrio.atendimento.ui.order.OrderDetailScreen
import com.lefrio.atendimento.ui.order.OrderDetailViewModel
import com.lefrio.atendimento.ui.signature.SignatureScreen
import com.lefrio.atendimento.ui.signature.SignatureViewModel
import com.lefrio.atendimento.ui.theme.LeFrioTheme
import com.lefrio.atendimento.util.AppUpdateInfo
import com.lefrio.atendimento.util.AppUpdateManager
import kotlinx.coroutines.launch

class MainActivity : ComponentActivity() {

    private val authViewModel: AuthViewModel by viewModels()
    private val dashboardViewModel: DashboardViewModel by viewModels()
    private lateinit var updateManager: AppUpdateManager

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        updateManager = AppUpdateManager(this)

        setContent {
            LeFrioTheme {
                Surface(
                    modifier = Modifier.fillMaxSize(),
                    color = Color(0xFFF8FAFC)
                ) {
                    val authState by authViewModel.uiState.collectAsState()
                    var selectedOrderId by remember { mutableStateOf<String?>(null) }
                    var signatureOrderId by remember { mutableStateOf<String?>(null) }
                    var updateInfo by remember { mutableStateOf<AppUpdateInfo?>(null) }
                    val scope = rememberCoroutineScope()

                    fun triggerCheckUpdate(manual: Boolean = false) {
                        scope.launch {
                            val info = updateManager.checkForUpdates()
                            if (info.isAvailable) {
                                updateInfo = info
                            } else if (manual) {
                                Toast.makeText(
                                    this@MainActivity,
                                    "Você já está na versão mais recente (${updateManager.getCurrentVersionName()})",
                                    Toast.LENGTH_LONG
                                ).show()
                            }
                        }
                    }

                    // Checagem automática silenciosa na inicialização
                    LaunchedEffect(Unit) {
                        triggerCheckUpdate(manual = false)
                    }

                    // Diálogo de atualização in-app
                    updateInfo?.let { info ->
                        UpdateDialog(
                            updateInfo = info,
                            onUpdateClick = {
                                updateManager.startDownloadAndInstall(info.downloadUrl) {
                                    Toast.makeText(
                                        this@MainActivity,
                                        "Iniciando download da versão ${info.latestVersionName}...",
                                        Toast.LENGTH_LONG
                                    ).show()
                                }
                            },
                            onDismissRequest = {
                                updateInfo = null
                            }
                        )
                    }

                    when (val state = authState) {
                        is AuthUiState.Success -> {
                            if (signatureOrderId != null) {
                                val sigViewModel = remember(signatureOrderId) {
                                    SignatureViewModel(application, signatureOrderId!!)
                                }
                                SignatureScreen(
                                    viewModel = sigViewModel,
                                    onBackClick = { signatureOrderId = null },
                                    onSuccessFinish = {
                                        signatureOrderId = null
                                        selectedOrderId = null
                                    }
                                )
                            } else if (selectedOrderId != null) {
                                val orderDetailViewModel = remember(selectedOrderId) {
                                    OrderDetailViewModel(application, selectedOrderId!!)
                                }
                                OrderDetailScreen(
                                    viewModel = orderDetailViewModel,
                                    onBackClick = { selectedOrderId = null },
                                    onProceedToSignatureClick = { orderId ->
                                        signatureOrderId = orderId
                                    }
                                )
                            } else {
                                DashboardScreen(
                                    user = state.user,
                                    viewModel = dashboardViewModel,
                                    onOrderClick = { orderId ->
                                        selectedOrderId = orderId
                                    },
                                    onLogoutClick = {
                                        authViewModel.logout()
                                    }
                                )
                            }
                        }

                        else -> {
                            LoginScreen(
                                viewModel = authViewModel,
                                appVersion = updateManager.getCurrentVersionName(),
                                onCheckUpdateClick = {
                                    triggerCheckUpdate(manual = true)
                                },
                                onLoginSuccess = { /* Autenticado */ }
                            )
                        }
                    }
                }
            }
        }
    }
}
