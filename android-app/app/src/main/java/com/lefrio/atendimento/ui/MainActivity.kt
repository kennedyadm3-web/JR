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
import com.lefrio.atendimento.ui.notifications.NotificationsViewModel
import com.lefrio.atendimento.ui.notifications.TechNotificationsScreen
import com.lefrio.atendimento.ui.order.OrderDetailScreen
import com.lefrio.atendimento.ui.order.OrderDetailViewModel
import com.lefrio.atendimento.ui.order.OrderSummaryScreen
import com.lefrio.atendimento.ui.profile.TechProfileScreen
import com.lefrio.atendimento.ui.signature.SignatureScreen
import com.lefrio.atendimento.ui.signature.SignatureViewModel
import androidx.compose.material3.DrawerValue
import androidx.compose.material3.ModalNavigationDrawer
import androidx.compose.material3.rememberDrawerState
import com.lefrio.atendimento.data.local.LocalServiceOrderDraft
import com.lefrio.atendimento.data.local.entity.ServiceOrderEntity
import com.lefrio.atendimento.data.local.entity.TechnicianEntity
import com.lefrio.atendimento.ui.components.AppDrawerContent
import com.lefrio.atendimento.ui.components.DrawerDestination
import com.lefrio.atendimento.ui.serviceorders.BatchSignatureScreen
import com.lefrio.atendimento.ui.serviceorders.CreateServiceOrderScreen
import com.lefrio.atendimento.ui.serviceorders.ServiceOrdersScreen
import com.lefrio.atendimento.ui.serviceorders.ServiceOrdersViewModel
import com.lefrio.atendimento.ui.theme.LeFrioTheme
import com.lefrio.atendimento.data.sync.ConnectionTelemetryManager
import com.lefrio.atendimento.util.AppUpdateInfo
import com.lefrio.atendimento.util.AppUpdateManager
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Job
import kotlinx.coroutines.launch

class MainActivity : ComponentActivity() {

    private val authViewModel: AuthViewModel by viewModels()
    private val dashboardViewModel: DashboardViewModel by viewModels()
    private val notificationsViewModel: NotificationsViewModel by viewModels()
    private lateinit var updateManager: AppUpdateManager
    private var pendingInstallAfterPermission = false
    private val foregroundResumeTick = mutableIntStateOf(0)
    private val installPermissionGrantedTick = mutableIntStateOf(0)

    override fun onResume() {
        super.onResume()
        ConnectionTelemetryManager.onAppForegrounded(this)
        installPermissionGrantedTick.intValue += 1
        if (pendingInstallAfterPermission) {
            pendingInstallAfterPermission = false
            if (updateManager.canInstallPackages()) {
                updateManager.installDownloadedApk()
            }
        } else if (::updateManager.isInitialized && updateManager.shouldAutoCheckNow()) {
            foregroundResumeTick.intValue += 1
        }
    }

    override fun onStop() {
        super.onStop()
        ConnectionTelemetryManager.onAppBackgrounded()
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
                    var showNotificationsScreen by remember { mutableStateOf(false) }
                    var showProfileScreen by remember { mutableStateOf(false) }
                    var availableUpdateInfo by remember { mutableStateOf<AppUpdateInfo?>(null) }
                    var showUpdateDialog by remember { mutableStateOf(false) }
                    var activeDownloadJob by remember { mutableStateOf<Job?>(null) }
                    val resumeTick by foregroundResumeTick
                    val permTick by installPermissionGrantedTick
                    val canInstallNow = remember(permTick) { updateManager.canInstallPackages() }
                    val scope = rememberCoroutineScope()

                    fun triggerCheckUpdate(manual: Boolean = false) {
                        scope.launch {
                            if (manual) {
                                updateManager.clearDismissedUpdate()
                            }
                            val info = updateManager.checkForUpdates(isManualCheck = manual)
                            if (info.isAvailable) {
                                availableUpdateInfo = info
                                val shouldShowPopup = manual || info.isMandatory || !updateManager.isUpdateDismissed(info.latestVersionCode)
                                if (shouldShowPopup) {
                                    showUpdateDialog = true
                                }
                            } else {
                                availableUpdateInfo = null
                                if (manual) {
                                    Toast.makeText(
                                        this@MainActivity,
                                        "Você já está na versão mais recente (v${updateManager.getCurrentVersionName()})",
                                        Toast.LENGTH_LONG
                                    ).show()
                                }
                            }
                        }
                    }

                    // Checagem automática silenciosa na inicialização e ao voltar ao app (a cada 30 min)
                    LaunchedEffect(Unit) {
                        triggerCheckUpdate(manual = false)
                    }

                    LaunchedEffect(resumeTick) {
                        if (resumeTick > 0 && !showUpdateDialog) {
                            triggerCheckUpdate(manual = false)
                        }
                    }

                    // Vincula ou encerra silenciosamente a telemetria de conexão conforme o técnico autenticado
                    LaunchedEffect(authState) {
                        when (val currentAuth = authState) {
                            is AuthUiState.Success -> {
                                ConnectionTelemetryManager.startForCurrentTechnician(this@MainActivity)
                            }
                            is AuthUiState.NeedsTechnicianSelect,
                            is AuthUiState.Idle -> {
                                ConnectionTelemetryManager.stop()
                            }
                            else -> {}
                        }
                    }

                    // Diálogo de atualização in-app otimizado
                    val dialogUpdateInfo = availableUpdateInfo
                    if (showUpdateDialog && dialogUpdateInfo != null) {
                        UpdateDialog(
                            updateInfo = dialogUpdateInfo,
                            currentVersionName = updateManager.getCurrentVersionName(),
                            canInstallPackages = canInstallNow,
                            onStartDownload = { onProgress, onCompleted, onError ->
                                activeDownloadJob?.cancel()
                                activeDownloadJob = scope.launch {
                                    try {
                                        val result = updateManager.downloadApkDirectly(
                                            downloadUrl = dialogUpdateInfo.downloadUrl,
                                            expectedVersionCode = dialogUpdateInfo.latestVersionCode,
                                            onProgress = onProgress
                                        )
                                        result.onSuccess {
                                            availableUpdateInfo = dialogUpdateInfo.copy(isAlreadyDownloaded = true)
                                            onCompleted()
                                            updateManager.installDownloadedApk(
                                                onNeedPermission = { pendingInstallAfterPermission = true }
                                            )
                                        }.onFailure { ex ->
                                            onError(ex.message ?: "Falha no download da atualização.")
                                        }
                                    } catch (_: CancellationException) {
                                        // Download cancelado voluntariamente pelo técnico
                                    }
                                }
                            },
                            onCancelDownload = {
                                activeDownloadJob?.cancel()
                                activeDownloadJob = null
                            },
                            onInstallNowClick = {
                                updateManager.installDownloadedApk(
                                    onNeedPermission = { pendingInstallAfterPermission = true }
                                )
                            },
                            onDismissRequest = {
                                activeDownloadJob?.cancel()
                                activeDownloadJob = null
                                updateManager.markUpdateDismissed(dialogUpdateInfo.latestVersionCode)
                                showUpdateDialog = false
                            }
                        )
                    }

                    when (val state = authState) {
                        is AuthUiState.Success -> {
                            val drawerState = rememberDrawerState(initialValue = DrawerValue.Closed)
                            var currentDestination by remember { mutableStateOf(DrawerDestination.ROTEIRO) }
                            var showCreateOrderScreen by remember { mutableStateOf(false) }
                            var editingDraft by remember { mutableStateOf<LocalServiceOrderDraft?>(null) }
                            var showBatchSignatureScreen by remember { mutableStateOf(false) }
                            var batchDraftsToSign by remember { mutableStateOf<List<LocalServiceOrderDraft>>(emptyList()) }
                            var batchOpenOrdersToSign by remember { mutableStateOf<List<ServiceOrderEntity>>(emptyList()) }
                            val serviceOrdersViewModel = remember(state.user.uid) {
                                ServiceOrdersViewModel(
                                    application,
                                    state.user
                                )
                            }

                            ModalNavigationDrawer(
                                drawerState = drawerState,
                                drawerContent = {
                                    AppDrawerContent(
                                        currentDestination = currentDestination,
                                        user = state.user,
                                        appVersion = updateManager.getCurrentVersionName(),
                                        pendingSyncCount = dashboardUiState.pendingSyncCount,
                                        availableUpdateVersion = availableUpdateInfo?.takeIf { it.isAvailable }?.latestVersionName,
                                        onNavigate = { dest ->
                                            scope.launch { drawerState.close() }
                                            when (dest) {
                                                DrawerDestination.ROTEIRO -> {
                                                    currentDestination = DrawerDestination.ROTEIRO
                                                    showCreateOrderScreen = false
                                                    editingDraft = null
                                                    showBatchSignatureScreen = false
                                                    batchDraftsToSign = emptyList()
                                                    batchOpenOrdersToSign = emptyList()
                                                    showProfileScreen = false
                                                    showNotificationsScreen = false
                                                    selectedOrderId = null
                                                    signatureOrderId = null
                                                    summaryOrderId = null
                                                }
                                                DrawerDestination.SERVICE_ORDERS -> {
                                                    currentDestination = DrawerDestination.SERVICE_ORDERS
                                                    showCreateOrderScreen = false
                                                    editingDraft = null
                                                    showBatchSignatureScreen = false
                                                    batchDraftsToSign = emptyList()
                                                    batchOpenOrdersToSign = emptyList()
                                                    showProfileScreen = false
                                                    showNotificationsScreen = false
                                                    selectedOrderId = null
                                                    signatureOrderId = null
                                                    summaryOrderId = null
                                                }
                                                DrawerDestination.NEW_OS -> {
                                                    currentDestination = DrawerDestination.SERVICE_ORDERS
                                                    showProfileScreen = false
                                                    showNotificationsScreen = false
                                                    selectedOrderId = null
                                                    signatureOrderId = null
                                                    summaryOrderId = null
                                                    editingDraft = null
                                                    showBatchSignatureScreen = false
                                                    batchDraftsToSign = emptyList()
                                                    batchOpenOrdersToSign = emptyList()
                                                    showCreateOrderScreen = true
                                                }
                                                DrawerDestination.NOTIFICATIONS -> {
                                                    showNotificationsScreen = true
                                                }
                                                DrawerDestination.PROFILE -> {
                                                    showProfileScreen = true
                                                }
                                            }
                                        },
                                        onForceSyncClick = {
                                            scope.launch { drawerState.close() }
                                            dashboardViewModel.forceSync()
                                            serviceOrdersViewModel.triggerSync()
                                            Toast.makeText(this@MainActivity, "Sincronização iniciada com a nuvem!", Toast.LENGTH_SHORT).show()
                                        },
                                        onUpdateAppClick = {
                                            scope.launch { drawerState.close() }
                                            if (availableUpdateInfo?.isAvailable == true) {
                                                showUpdateDialog = true
                                            } else {
                                                triggerCheckUpdate(manual = true)
                                            }
                                        },
                                        onLogoutClick = {
                                            scope.launch { drawerState.close() }
                                            showProfileScreen = false
                                            showCreateOrderScreen = false
                                            editingDraft = null
                                            showBatchSignatureScreen = false
                                            batchDraftsToSign = emptyList()
                                            batchOpenOrdersToSign = emptyList()
                                            selectedOrderId = null
                                            signatureOrderId = null
                                            summaryOrderId = null
                                            authViewModel.switchTechnician()
                                        }
                                    )
                                }
                            ) {
                                if (showProfileScreen) {
                                    TechProfileScreen(
                                        user = state.user,
                                        appVersion = updateManager.getCurrentVersionName(),
                                        pendingSyncCount = dashboardUiState.pendingSyncCount,
                                        availableUpdateVersion = availableUpdateInfo?.takeIf { it.isAvailable }?.latestVersionName,
                                        onBackClick = { showProfileScreen = false },
                                        onCheckUpdateClick = {
                                            if (availableUpdateInfo?.isAvailable == true) {
                                                showUpdateDialog = true
                                            } else {
                                                triggerCheckUpdate(manual = true)
                                            }
                                        },
                                        onForceSyncClick = {
                                            dashboardViewModel.forceSync()
                                            serviceOrdersViewModel.triggerSync()
                                            Toast.makeText(this, "Sincronização iniciada com a nuvem!", Toast.LENGTH_SHORT).show()
                                        },
                                        onSwitchTechClick = {
                                            showProfileScreen = false
                                            showCreateOrderScreen = false
                                            editingDraft = null
                                            showBatchSignatureScreen = false
                                            batchDraftsToSign = emptyList()
                                            batchOpenOrdersToSign = emptyList()
                                            selectedOrderId = null
                                            signatureOrderId = null
                                            summaryOrderId = null
                                            authViewModel.switchTechnician()
                                        },
                                        onLogoutClick = {
                                            showProfileScreen = false
                                            showCreateOrderScreen = false
                                            editingDraft = null
                                            showBatchSignatureScreen = false
                                            batchDraftsToSign = emptyList()
                                            batchOpenOrdersToSign = emptyList()
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
                                    
                                    if (detailState.order?.status == "finalizada" || detailState.order?.status == "pre_finalizada") {
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
                                } else if (showBatchSignatureScreen) {
                                    BatchSignatureScreen(
                                        user = state.user,
                                        viewModel = serviceOrdersViewModel,
                                        drafts = batchDraftsToSign,
                                        openOrders = batchOpenOrdersToSign,
                                        onBackClick = {
                                            showBatchSignatureScreen = false
                                            batchDraftsToSign = emptyList()
                                            batchOpenOrdersToSign = emptyList()
                                        },
                                        onBatchFinished = {
                                            showBatchSignatureScreen = false
                                            batchDraftsToSign = emptyList()
                                            batchOpenOrdersToSign = emptyList()
                                        }
                                    )
                                } else if (showCreateOrderScreen) {
                                    CreateServiceOrderScreen(
                                        user = state.user,
                                        viewModel = serviceOrdersViewModel,
                                        initialDraft = editingDraft,
                                        onBackClick = {
                                            showCreateOrderScreen = false
                                            editingDraft = null
                                        },
                                        onDraftSaved = {
                                            showCreateOrderScreen = false
                                            editingDraft = null
                                        },
                                        onOrderCreated = { createdId ->
                                            showCreateOrderScreen = false
                                            editingDraft = null
                                            selectedOrderId = createdId
                                        }
                                    )
                                } else if (currentDestination == DrawerDestination.SERVICE_ORDERS) {
                                    ServiceOrdersScreen(
                                        user = state.user,
                                        viewModel = serviceOrdersViewModel,
                                        onMenuClick = {
                                            scope.launch { drawerState.open() }
                                        },
                                        onOrderClick = { orderId ->
                                            selectedOrderId = orderId
                                        },
                                        onDraftClick = { draft ->
                                            editingDraft = draft
                                            showCreateOrderScreen = true
                                        },
                                        onStartBatchSignature = { drafts, openOrders ->
                                            batchDraftsToSign = drafts
                                            batchOpenOrdersToSign = openOrders
                                            showBatchSignatureScreen = true
                                        },
                                        onNewOrderClick = {
                                            editingDraft = null
                                            showCreateOrderScreen = true
                                        },
                                        onProfileClick = {
                                            showProfileScreen = true
                                        }
                                    )
                                } else {
                                    DashboardScreen(
                                        user = state.user,
                                        viewModel = dashboardViewModel,
                                        onMenuClick = {
                                            scope.launch { drawerState.open() }
                                        },
                                        onOrderClick = { orderId ->
                                            selectedOrderId = orderId
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
