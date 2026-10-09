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
import com.lefrio.atendimento.ui.auth.TechnicianSelectScreen
import com.lefrio.atendimento.ui.components.UpdateDialog
import com.lefrio.atendimento.ui.dashboard.DashboardScreen
import com.lefrio.atendimento.ui.dashboard.DashboardViewModel
import com.lefrio.atendimento.ui.expenses.RouteExpensesScreen
import com.lefrio.atendimento.ui.expenses.RouteExpensesViewModel
import com.lefrio.atendimento.ui.notifications.NotificationsViewModel
import com.lefrio.atendimento.ui.notifications.TechNotificationsScreen
import com.lefrio.atendimento.ui.order.OrderDetailScreen
import com.lefrio.atendimento.ui.order.OrderDetailViewModel
import com.lefrio.atendimento.ui.order.OrderSummaryScreen
import com.lefrio.atendimento.ui.profile.TechProfileScreen
import com.lefrio.atendimento.ui.signature.SignatureScreen
import com.lefrio.atendimento.ui.signature.SignatureViewModel
import com.lefrio.atendimento.ui.theme.LeFrioTheme
import com.lefrio.atendimento.util.AppUpdateInfo
import com.lefrio.atendimento.util.AppUpdateManager
import kotlinx.coroutines.launch

class MainActivity : ComponentActivity() {

    private val authViewModel: AuthViewModel by viewModels()
    private val dashboardViewModel: DashboardViewModel by viewModels()
    private val notificationsViewModel: NotificationsViewModel by viewModels()
    private lateinit var updateManager: AppUpdateManager
    private var pendingInstallAfterPermission = false

    override fun onResume() {
        super.onResume()
        if (pendingInstallAfterPermission) {
            pendingInstallAfterPermission = false
            if (android.os.Build.VERSION.SDK_INT < android.os.Build.VERSION_CODES.O || packageManager.canRequestPackageInstalls()) {
                updateManager.installDownloadedApk()
            }
        }
    }

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
                    val dashboardUiState by dashboardViewModel.uiState.collectAsState()

                    var selectedOrderId by remember { mutableStateOf<String?>(null) }
                    var signatureOrderId by remember { mutableStateOf<String?>(null) }
                    var summaryOrderId by remember { mutableStateOf<String?>(null) }
                    var showExpensesScreen by remember { mutableStateOf(false) }
                    var showNotificationsScreen by remember { mutableStateOf(false) }
                    var showProfileScreen by remember { mutableStateOf(false) }
                    var updateInfo by remember { mutableStateOf<AppUpdateInfo?>(null) }
                    val scope = rememberCoroutineScope()

                    fun triggerCheckUpdate(manual: Boolean = false) {
                        scope.launch {
                            if (manual) {
                                updateManager.clearDismissedUpdate()
                            }
                            val info = updateManager.checkForUpdates(isManualCheck = manual)
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

                    // Diálogo de atualização in-app aprimorado
                    updateInfo?.let { info ->
                        UpdateDialog(
                            updateInfo = info,
                            onStartDownload = { onProgress, onCompleted, onError ->
                                scope.launch {
                                    val result = updateManager.downloadApkDirectly(
                                        downloadUrl = info.downloadUrl,
                                        onProgress = onProgress
                                    )
                                    result.onSuccess {
                                        onCompleted()
                                        updateManager.installDownloadedApk(onNeedPermission = { pendingInstallAfterPermission = true })
                                    }.onFailure { ex ->
                                        onError(ex.message ?: "Falha no download da atualização.")
                                    }
                                }
                            },
                            onInstallNowClick = {
                                updateManager.installDownloadedApk(onNeedPermission = { pendingInstallAfterPermission = true })
                            },
                            onDismissRequest = {
                                updateManager.markUpdateDismissed(info.latestVersionCode)
                                updateInfo = null
                            }
                        )
                    }

                    when (val state = authState) {
                        is AuthUiState.Success -> {
                            if (showProfileScreen) {
                                TechProfileScreen(
                                    user = state.user,
                                    appVersion = updateManager.getCurrentVersionName(),
                                    pendingSyncCount = dashboardUiState.pendingSyncCount,
                                    onBackClick = { showProfileScreen = false },
                                    onCheckUpdateClick = { triggerCheckUpdate(manual = true) },
                                    onForceSyncClick = {
                                        dashboardViewModel.forceSync()
                                        Toast.makeText(this, "Sincronização iniciada com a nuvem!", Toast.LENGTH_SHORT).show()
                                    },
                                    onSwitchTechClick = {
                                        showProfileScreen = false
                                        selectedOrderId = null
                                        signatureOrderId = null
                                        summaryOrderId = null
                                        authViewModel.switchTechnician()
                                    },
                                    onLogoutClick = {
                                        showProfileScreen = false
                                        selectedOrderId = null
                                        signatureOrderId = null
                                        summaryOrderId = null
                                        authViewModel.logout()
                                    }
                                )
                            } else if (showNotificationsScreen) {
                                TechNotificationsScreen(
                                    viewModel = notificationsViewModel,
                                    onBackClick = { showNotificationsScreen = false }
                                )
                            } else if (showExpensesScreen) {
                                val expensesViewModel = remember(state.user.uid) {
                                    RouteExpensesViewModel(application, state.user)
                                }
                                RouteExpensesScreen(
                                    viewModel = expensesViewModel,
                                    onBackClick = { showExpensesScreen = false }
                                )
                            } else if (summaryOrderId != null) {
                                val orderDetailViewModel = remember(summaryOrderId) {
                                    OrderDetailViewModel(application, summaryOrderId!!)
                                }
                                val detailState by orderDetailViewModel.uiState.collectAsState()
                                detailState.order?.let { finishedOrder ->
                                    OrderSummaryScreen(
                                        order = finishedOrder,
                                        equipments = detailState.checklistItems,
                                        onBackClick = { summaryOrderId = null }
                                    )
                                }
                            } else if (signatureOrderId != null) {
                                val sigViewModel = remember(signatureOrderId) {
                                    SignatureViewModel(application, signatureOrderId!!)
                                }
                                SignatureScreen(
                                    viewModel = sigViewModel,
                                    onBackClick = { signatureOrderId = null },
                                    onSuccessFinish = {
                                        summaryOrderId = signatureOrderId
                                        signatureOrderId = null
                                        selectedOrderId = null
                                    }
                                )
                            } else if (selectedOrderId != null) {
                                val orderDetailViewModel = remember(selectedOrderId) {
                                    OrderDetailViewModel(application, selectedOrderId!!)
                                }
                                val detailState by orderDetailViewModel.uiState.collectAsState()
                                
                                if (detailState.order?.status == "finalizada") {
                                    detailState.order?.let { finishedOrder ->
                                        OrderSummaryScreen(
                                            order = finishedOrder,
                                            equipments = detailState.checklistItems,
                                            onBackClick = { selectedOrderId = null }
                                        )
                                    }
                                } else {
                                    OrderDetailScreen(
                                        viewModel = orderDetailViewModel,
                                        onBackClick = { selectedOrderId = null },
                                        onProceedToSignatureClick = { orderId ->
                                            signatureOrderId = orderId
                                        }
                                    )
                                }
                            } else {
                                DashboardScreen(
                                    user = state.user,
                                    viewModel = dashboardViewModel,
                                    onOrderClick = { orderId ->
                                        selectedOrderId = orderId
                                    },
                                    onExpensesClick = {
                                        showExpensesScreen = true
                                    },
                                    onNotificationsClick = {
                                        showNotificationsScreen = true
                                    },
                                    onProfileClick = {
                                        showProfileScreen = true
                                    },
                                    onLogoutClick = {
                                        authViewModel.switchTechnician()
                                    }
                                )
                            }
                        }

                        is AuthUiState.NeedsTechnicianSelect -> {
                            TechnicianSelectScreen(
                                technicians = state.technicians,
                                pinError = state.pinError,
                                onValidatePin = { techId, pin ->
                                    authViewModel.validatePin(techId, pin)
                                },
                                onLogoutClick = {
                                    authViewModel.logout()
                                }
                            )
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
