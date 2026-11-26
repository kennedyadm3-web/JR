package com.lefrio.atendimento.ui.serviceorders

import android.widget.Toast
import androidx.compose.animation.core.*
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.rotate
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardCapitalization
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.lefrio.atendimento.data.auth.TechnicianUser
import com.lefrio.atendimento.data.local.LocalServiceOrderDraft
import com.lefrio.atendimento.data.local.ServiceOrderDraftStorage
import com.lefrio.atendimento.data.local.entity.ServiceOrderEntity
import com.lefrio.atendimento.ui.theme.BluePrimary
import com.lefrio.atendimento.ui.theme.TextPrimary
import com.lefrio.atendimento.ui.theme.TextSecondary
import com.lefrio.atendimento.util.DateTimeUtils
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

private data class BatchLocationAnchor(
    val clientId: String,
    val clientName: String,
    val addressId: String,
    val addressStreet: String
)

private fun isOrderEligibleForBatch(order: ServiceOrderEntity): Boolean {
    return order.status != "finalizada" && order.status != "pre_finalizada" && order.status != "cancelada"
}

private fun isSameBatchLocation(
    anchor: BatchLocationAnchor,
    clientId: String,
    clientName: String,
    addressId: String,
    addressStreet: String
): Boolean {
    val aId = anchor.addressId.trim()
    val bId = addressId.trim()
    if (aId.isNotEmpty() && bId.isNotEmpty() && aId == bId) {
        return true
    }
    val cNameA = anchor.clientName.trim().uppercase(Locale.getDefault())
    val cNameB = clientName.trim().uppercase(Locale.getDefault())
    val streetA = anchor.addressStreet.trim().uppercase(Locale.getDefault())
    val streetB = addressStreet.trim().uppercase(Locale.getDefault())
    return cNameA.isNotEmpty() && cNameA == cNameB && streetA.isNotEmpty() && streetA == streetB
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ServiceOrdersScreen(
    user: TechnicianUser,
    viewModel: ServiceOrdersViewModel,
    onMenuClick: () -> Unit,
    onOrderClick: (orderId: String) -> Unit,
    onDraftClick: (draft: LocalServiceOrderDraft) -> Unit,
    onStartBatchSignature: (drafts: List<LocalServiceOrderDraft>, openOrders: List<ServiceOrderEntity>) -> Unit,
    onNewOrderClick: () -> Unit,
    onProfileClick: () -> Unit
) {
    val uiState by viewModel.uiState.collectAsState()
    val context = LocalContext.current
    var draftPendingDelete by remember { mutableStateOf<LocalServiceOrderDraft?>(null) }
    var isBatchMode by remember { mutableStateOf(false) }
    var selectedDraftIds by remember { mutableStateOf<Set<String>>(emptySet()) }
    var selectedOrderIds by remember { mutableStateOf<Set<String>>(emptySet()) }

    LaunchedEffect(Unit) {
        viewModel.refreshDrafts()
        viewModel.triggerSync(forceRefresh = false)
    }

    val eligibleOpenOrders = remember(uiState.orders) {
        uiState.orders.filter { isOrderEligibleForBatch(it) }
    }
    val totalSignableCount = uiState.drafts.size + eligibleOpenOrders.size

    // Mantém seleção limpa caso alguma O.S. suma ou seja finalizada
    LaunchedEffect(uiState.drafts, uiState.orders) {
        val validDraftIds = uiState.drafts.map { it.id }.toSet()
        val validOrderIds = eligibleOpenOrders.map { it.id }.toSet()
        selectedDraftIds = selectedDraftIds.intersect(validDraftIds)
        selectedOrderIds = selectedOrderIds.intersect(validOrderIds)
        if (totalSignableCount == 0 && isBatchMode) {
            isBatchMode = false
        }
    }

    val lockedLocation: BatchLocationAnchor? = remember(selectedDraftIds, selectedOrderIds, uiState.drafts, eligibleOpenOrders) {
        val firstDraft = uiState.drafts.firstOrNull { it.id in selectedDraftIds }
        if (firstDraft != null) {
            BatchLocationAnchor(
                clientId = firstDraft.clientId,
                clientName = firstDraft.clientName,
                addressId = firstDraft.addressId,
                addressStreet = firstDraft.addressStreet
            )
        } else {
            val firstOrder = eligibleOpenOrders.firstOrNull { it.id in selectedOrderIds }
            firstOrder?.let {
                BatchLocationAnchor(
                    clientId = it.clientId,
                    clientName = it.clientName,
                    addressId = it.addressId,
                    addressStreet = it.addressStreet
                )
            }
        }
    }
    val totalSelectedBatchCount = selectedDraftIds.size + selectedOrderIds.size

    fun exitBatchMode() {
        isBatchMode = false
        selectedDraftIds = emptySet()
        selectedOrderIds = emptySet()
    }

    fun selectAllForLockedLocation() {
        val anchor = lockedLocation ?: return
        val matchingDrafts = uiState.drafts.filter { draft ->
            viewModel.validateDraftForBatch(draft) == null &&
                isSameBatchLocation(anchor, draft.clientId, draft.clientName, draft.addressId, draft.addressStreet)
        }
        val matchingOrders = eligibleOpenOrders.filter { order ->
            isSameBatchLocation(anchor, order.clientId, order.clientName, order.addressId, order.addressStreet)
        }
        selectedDraftIds = matchingDrafts.map { it.id }.toSet()
        selectedOrderIds = matchingOrders.map { it.id }.toSet()
        val incompleteSameLocationCount = uiState.drafts.count { draft ->
            viewModel.validateDraftForBatch(draft) != null &&
                isSameBatchLocation(anchor, draft.clientId, draft.clientName, draft.addressId, draft.addressStreet)
        }
        if (incompleteSameLocationCount > 0) {
            Toast.makeText(
                context,
                "$incompleteSameLocationCount O.S. salva(s) deste endereço está(ão) incompleta(s) e não foi(foram) marcada(s).",
                Toast.LENGTH_LONG
            ).show()
        }
    }

    val infiniteTransition = rememberInfiniteTransition(label = "sync_spin")
    val rotationAngle by infiniteTransition.animateFloat(
        initialValue = 0f,
        targetValue = 360f,
        animationSpec = infiniteRepeatable(
            animation = tween(durationMillis = 1000, easing = LinearEasing),
            repeatMode = RepeatMode.Restart
        ),
        label = "rotation"
    )

    Scaffold(
        topBar = {
            TopAppBar(
                title = {
                    Column {
                        Text(
                            text = if (isBatchMode) "Assinatura em Lote" else "Ordens de Serviço",
                            fontSize = 17.sp,
                            fontWeight = FontWeight.Black,
                            color = if (isBatchMode) Color(0xFF065F46) else BluePrimary,
                            maxLines = 1,
                            overflow = TextOverflow.Ellipsis
                        )
                        Text(
                            text = if (isBatchMode) {
                                if (totalSelectedBatchCount == 0) "Selecione O.S. do mesmo cliente e endereço"
                                else "$totalSelectedBatchCount O.S. selecionada(s) para assinatura única"
                            } else {
                                "Ordens de Serviço do Dia • ${user.name}"
                            },
                            fontSize = 11.sp,
                            color = TextSecondary,
                            fontWeight = FontWeight.Medium,
                            maxLines = 1,
                            overflow = TextOverflow.Ellipsis
                        )
                    }
                },
                navigationIcon = {
                    if (isBatchMode) {
                        IconButton(onClick = { exitBatchMode() }) {
                            Icon(
                                imageVector = Icons.Default.Close,
                                contentDescription = "Sair do modo lote",
                                tint = Color(0xFF065F46)
                            )
                        }
                    } else {
                        IconButton(onClick = onMenuClick) {
                            Icon(
                                imageVector = Icons.Default.Menu,
                                contentDescription = "Abrir Menu",
                                tint = BluePrimary
                            )
                        }
                    }
                },
                actions = {
                    if (isBatchMode) {
                        TextButton(onClick = { exitBatchMode() }) {
                            Text(
                                text = "Cancelar",
                                color = Color(0xFFDC2626),
                                fontWeight = FontWeight.Bold,
                                fontSize = 13.sp
                            )
                        }
                    } else {
                        if (totalSignableCount >= 1) {
                            IconButton(
                                onClick = {
                                    isBatchMode = true
                                    selectedDraftIds = emptySet()
                                    selectedOrderIds = emptySet()
                                    viewModel.setFilterTab(OSFilterTab.ALL)
                                }
                            ) {
                                Icon(
                                    imageVector = Icons.Default.DoneAll,
                                    contentDescription = "Assinar O.S. em Lote",
                                    tint = Color(0xFF059669)
                                )
                            }
                        }
                        IconButton(
                            onClick = { viewModel.triggerSync() },
                            enabled = !uiState.isSyncing
                        ) {
                            Icon(
                                imageVector = Icons.Default.Refresh,
                                contentDescription = "Sincronizar O.S.",
                                tint = if (uiState.isSyncing) BluePrimary.copy(alpha = 0.6f) else BluePrimary,
                                modifier = if (uiState.isSyncing) Modifier.rotate(rotationAngle) else Modifier
                            )
                        }
                        IconButton(onClick = onProfileClick) {
                            Icon(
                                imageVector = Icons.Default.AccountCircle,
                                contentDescription = "Meu Perfil",
                                tint = BluePrimary
                            )
                        }
                    }
                },
                colors = TopAppBarDefaults.topAppBarColors(
                    containerColor = if (isBatchMode) Color(0xFFECFDF5) else Color.White
                )
            )
        },
        floatingActionButton = {
            if (isBatchMode) {
                ExtendedFloatingActionButton(
                    onClick = {
                        if (totalSelectedBatchCount == 0) {
                            Toast.makeText(
                                context,
                                "Selecione ao menos uma O.S. para continuar para a assinatura.",
                                Toast.LENGTH_SHORT
                            ).show()
                            return@ExtendedFloatingActionButton
                        }
                        val chosenDrafts = uiState.drafts.filter { it.id in selectedDraftIds }
                        val chosenOrders = eligibleOpenOrders.filter { it.id in selectedOrderIds }
                        exitBatchMode()
                        onStartBatchSignature(chosenDrafts, chosenOrders)
                    },
                    icon = { Icon(Icons.Default.DoneAll, contentDescription = null, tint = Color.White) },
                    text = {
                        Text(
                            text = if (totalSelectedBatchCount == 0) "SELECIONE AS O.S." else "ASSINAR EM LOTE ($totalSelectedBatchCount)",
                            fontWeight = FontWeight.Black,
                            fontSize = 13.sp,
                            color = Color.White
                        )
                    },
                    containerColor = if (totalSelectedBatchCount > 0) Color(0xFF059669) else Color(0xFF94A3B8),
                    contentColor = Color.White,
                    shape = RoundedCornerShape(16.dp),
                    elevation = FloatingActionButtonDefaults.elevation(defaultElevation = 6.dp)
                )
            } else {
                ExtendedFloatingActionButton(
                    onClick = onNewOrderClick,
                    icon = { Icon(Icons.Default.Add, contentDescription = null, tint = Color.White) },
                    text = { Text("NOVA O.S.", fontWeight = FontWeight.Black, fontSize = 13.sp, color = Color.White) },
                    containerColor = Color(0xFF581C87), // Roxo do botão de Nova O.S. PWA
                    contentColor = Color.White,
                    shape = RoundedCornerShape(16.dp),
                    elevation = FloatingActionButtonDefaults.elevation(defaultElevation = 6.dp)
                )
            }
        },
        containerColor = Color(0xFFF8FAFC)
    ) { paddingValues ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(paddingValues)
        ) {
            // 1. CARDS DE MÉTRICAS RÁPIDAS
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = 14.dp, vertical = 8.dp),
                horizontalArrangement = Arrangement.spacedBy(8.dp)
            ) {
                MetricMiniCard(
                    title = "Total O.S.",
                    count = uiState.totalCount,
                    bgColor = Color(0xFFF1F5F9),
                    textColor = TextPrimary,
                    modifier = Modifier.weight(1f)
                )
                MetricMiniCard(
                    title = "Salvas",
                    count = uiState.draftsCount,
                    bgColor = Color(0xFFDBEAFE),
                    textColor = Color(0xFF1E40AF),
                    modifier = Modifier
                        .weight(1f)
                        .clickable { viewModel.setFilterTab(OSFilterTab.DRAFTS) }
                )
                MetricMiniCard(
                    title = "Em Rota",
                    count = uiState.inProgressCount,
                    bgColor = Color(0xFFFEF3C7),
                    textColor = Color(0xFFB45309),
                    modifier = Modifier.weight(1f)
                )
                MetricMiniCard(
                    title = "Concluídas",
                    count = uiState.finishedCount,
                    bgColor = Color(0xFFDCFCE7),
                    textColor = Color(0xFF15803D),
                    modifier = Modifier.weight(1f)
                )
            }

            // 2. BARRA DE BUSCA
            OutlinedTextField(
                value = uiState.searchQuery,
                onValueChange = { viewModel.setSearchQuery(it.uppercase(Locale.getDefault())) },
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = 14.dp, vertical = 4.dp),
                textStyle = LocalTextStyle.current.copy(fontSize = 13.sp, color = TextPrimary),
                placeholder = {
                    Text(
                        text = "Buscar O.S., salvas, cliente ou endereço...",
                        fontSize = 13.sp,
                        color = TextSecondary,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis
                    )
                },
                leadingIcon = {
                    Icon(
                        Icons.Default.Search,
                        contentDescription = null,
                        tint = TextSecondary,
                        modifier = Modifier.size(18.dp)
                    )
                },
                trailingIcon = {
                    if (uiState.searchQuery.isNotBlank()) {
                        IconButton(onClick = { viewModel.setSearchQuery("") }) {
                            Icon(
                                Icons.Default.Close,
                                contentDescription = "Limpar busca",
                                tint = TextSecondary,
                                modifier = Modifier.size(16.dp)
                            )
                        }
                    }
                },
                shape = RoundedCornerShape(12.dp),
                keyboardOptions = KeyboardOptions(capitalization = KeyboardCapitalization.Characters),
                colors = OutlinedTextFieldDefaults.colors(
                    focusedContainerColor = Color.White,
                    unfocusedContainerColor = Color.White,
                    unfocusedBorderColor = Color(0xFFCBD5E1),
                    focusedBorderColor = BluePrimary
                ),
                singleLine = true
            )

            // 3. ABAS DE FILTRO POR STATUS (inclui O.S. Salvas localmente por 7 dias)
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .horizontalScroll(rememberScrollState())
                    .padding(horizontal = 14.dp, vertical = 6.dp),
                horizontalArrangement = Arrangement.spacedBy(6.dp)
            ) {
                FilterTabChip(
                    label = "Todas (${uiState.totalCount + uiState.draftsCount})",
                    isSelected = uiState.selectedTab == OSFilterTab.ALL,
                    onClick = { viewModel.setFilterTab(OSFilterTab.ALL) }
                )
                FilterTabChip(
                    label = "Salvas (${uiState.draftsCount})",
                    isSelected = uiState.selectedTab == OSFilterTab.DRAFTS,
                    highlightAccent = uiState.draftsCount > 0,
                    onClick = { viewModel.setFilterTab(OSFilterTab.DRAFTS) }
                )
                FilterTabChip(
                    label = "Abertas (${uiState.openCount})",
                    isSelected = uiState.selectedTab == OSFilterTab.OPEN,
                    onClick = { viewModel.setFilterTab(OSFilterTab.OPEN) }
                )
                FilterTabChip(
                    label = "Em Rota (${uiState.inProgressCount})",
                    isSelected = uiState.selectedTab == OSFilterTab.IN_PROGRESS,
                    onClick = { viewModel.setFilterTab(OSFilterTab.IN_PROGRESS) }
                )
                FilterTabChip(
                    label = "Feitas (${uiState.finishedCount})",
                    isSelected = uiState.selectedTab == OSFilterTab.FINISHED,
                    onClick = { viewModel.setFilterTab(OSFilterTab.FINISHED) }
                )
            }

            // 3.5 BANNER DE ASSINATURA EM LOTE (ACESSO RÁPIDO OU CONTROLE DE SELEÇÃO)
            if (isBatchMode) {
                Surface(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(horizontal = 14.dp, vertical = 4.dp),
                    shape = RoundedCornerShape(12.dp),
                    color = Color(0xFFECFDF5),
                    border = BorderStroke(1.dp, Color(0xFF6EE7B7))
                ) {
                    Column(
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(horizontal = 12.dp, vertical = 9.dp),
                        verticalArrangement = Arrangement.spacedBy(6.dp)
                    ) {
                        Row(
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.SpaceBetween,
                            modifier = Modifier.fillMaxWidth()
                        ) {
                            Row(
                                verticalAlignment = Alignment.CenterVertically,
                                modifier = Modifier.weight(1f)
                            ) {
                                Icon(
                                    imageVector = Icons.Default.DoneAll,
                                    contentDescription = null,
                                    tint = Color(0xFF059669),
                                    modifier = Modifier.size(16.dp)
                                )
                                Spacer(modifier = Modifier.width(6.dp))
                                Text(
                                    text = if (lockedLocation == null) {
                                        "Toque nas O.S. salvas ou abertas do mesmo local"
                                    } else {
                                        "Local: ${lockedLocation.clientName}"
                                    },
                                    fontSize = 11.sp,
                                    fontWeight = FontWeight.Black,
                                    color = Color(0xFF065F46),
                                    maxLines = 1,
                                    overflow = TextOverflow.Ellipsis
                                )
                            }
                            if (lockedLocation != null) {
                                TextButton(
                                    onClick = { selectAllForLockedLocation() },
                                    contentPadding = PaddingValues(horizontal = 8.dp, vertical = 2.dp),
                                    modifier = Modifier.height(28.dp)
                                ) {
                                    Text(
                                        text = "Selecionar todas",
                                        fontSize = 11.sp,
                                        fontWeight = FontWeight.Black,
                                        color = Color(0xFF047857)
                                    )
                                }
                            }
                        }
                        if (lockedLocation != null && lockedLocation.addressStreet.isNotBlank()) {
                            Text(
                                text = lockedLocation.addressStreet,
                                fontSize = 10.sp,
                                fontWeight = FontWeight.SemiBold,
                                color = Color(0xFF047857),
                                maxLines = 1,
                                overflow = TextOverflow.Ellipsis
                            )
                        }
                    }
                }
            } else if (totalSignableCount >= 2) {
                Surface(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(horizontal = 14.dp, vertical = 4.dp)
                        .clip(RoundedCornerShape(12.dp))
                        .clickable {
                            isBatchMode = true
                            selectedDraftIds = emptySet()
                            selectedOrderIds = emptySet()
                            viewModel.setFilterTab(OSFilterTab.ALL)
                        },
                    shape = RoundedCornerShape(12.dp),
                    color = Color(0xFFECFDF5),
                    border = BorderStroke(1.dp, Color(0xFFA7F3D0))
                ) {
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(horizontal = 12.dp, vertical = 9.dp),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Row(
                            verticalAlignment = Alignment.CenterVertically,
                            modifier = Modifier.weight(1f)
                        ) {
                            Icon(
                                imageVector = Icons.Default.DoneAll,
                                contentDescription = null,
                                tint = Color(0xFF059669),
                                modifier = Modifier.size(18.dp)
                            )
                            Spacer(modifier = Modifier.width(8.dp))
                            Column {
                                Text(
                                    text = "Assinar O.S. em Lote",
                                    fontSize = 12.sp,
                                    fontWeight = FontWeight.Black,
                                    color = Color(0xFF065F46)
                                )
                                Text(
                                    text = "Colha 1 única assinatura para várias O.S. do mesmo local",
                                    fontSize = 10.sp,
                                    color = Color(0xFF047857),
                                    maxLines = 1,
                                    overflow = TextOverflow.Ellipsis
                                )
                            }
                        }
                        Icon(
                            imageVector = Icons.Default.ChevronRight,
                            contentDescription = null,
                            tint = Color(0xFF059669),
                            modifier = Modifier.size(18.dp)
                        )
                    }
                }
            }

            // 4. LISTA DE ORDENS DE SERVIÇO E O.S. SALVAS NO DISPOSITIVO
            val showDraftsSection = uiState.selectedTab == OSFilterTab.DRAFTS ||
                (uiState.selectedTab == OSFilterTab.ALL && uiState.filteredDrafts.isNotEmpty())
            val isListEmpty = when (uiState.selectedTab) {
                OSFilterTab.DRAFTS -> uiState.filteredDrafts.isEmpty()
                OSFilterTab.ALL -> uiState.filteredDrafts.isEmpty() && uiState.filteredOrders.isEmpty()
                else -> uiState.filteredOrders.isEmpty()
            }

            if (isListEmpty) {
                Box(
                    modifier = Modifier
                        .fillMaxSize()
                        .padding(start = 24.dp, top = 24.dp, end = 24.dp, bottom = 96.dp),
                    contentAlignment = Alignment.Center
                ) {
                    Column(
                        horizontalAlignment = Alignment.CenterHorizontally,
                        verticalArrangement = Arrangement.Center
                    ) {
                        Box(
                            modifier = Modifier
                                .size(64.dp)
                                .clip(RoundedCornerShape(32.dp))
                                .background(
                                    if (uiState.selectedTab == OSFilterTab.DRAFTS) Color(0xFFDBEAFE)
                                    else Color(0xFFEDE9FE)
                                ),
                            contentAlignment = Alignment.Center
                        ) {
                            Icon(
                                imageVector = if (uiState.selectedTab == OSFilterTab.DRAFTS) Icons.Default.Save else Icons.Default.Assignment,
                                contentDescription = null,
                                tint = if (uiState.selectedTab == OSFilterTab.DRAFTS) Color(0xFF1D4ED8) else Color(0xFF6B21A8),
                                modifier = Modifier.size(32.dp)
                            )
                        }
                        Spacer(modifier = Modifier.height(14.dp))
                        Text(
                            text = if (uiState.selectedTab == OSFilterTab.DRAFTS) {
                                "Nenhuma O.S. salva no dispositivo"
                            } else {
                                "Nenhuma O.S. encontrada"
                            },
                            fontSize = 15.sp,
                            fontWeight = FontWeight.Bold,
                            color = TextPrimary
                        )
                        Spacer(modifier = Modifier.height(4.dp))
                        Text(
                            text = if (uiState.selectedTab == OSFilterTab.DRAFTS) {
                                "Ao criar uma nova O.S., toque em 'SALVAR O.S.' no rodapé para guardar os dados preenchidos neste aparelho por até 7 dias e continuar de onde parou."
                            } else {
                                "Toque em '+ NOVA O.S.' abaixo para abrir um atendimento nos endereços do seu roteiro."
                            },
                            fontSize = 12.sp,
                            color = TextSecondary,
                            textAlign = TextAlign.Center
                        )
                    }
                }
            } else {
                LazyColumn(
                    modifier = Modifier.fillMaxSize(),
                    contentPadding = PaddingValues(start = 14.dp, top = 6.dp, end = 14.dp, bottom = 96.dp),
                    verticalArrangement = Arrangement.spacedBy(10.dp)
                ) {
                    if (showDraftsSection && uiState.filteredDrafts.isNotEmpty()) {
                        item(key = "header_saved_drafts") {
                            Row(
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .padding(top = 2.dp, bottom = 2.dp),
                                horizontalArrangement = Arrangement.SpaceBetween,
                                verticalAlignment = Alignment.CenterVertically
                            ) {
                                Row(verticalAlignment = Alignment.CenterVertically) {
                                    Icon(
                                        imageVector = Icons.Default.Save,
                                        contentDescription = null,
                                        tint = Color(0xFF1D4ED8),
                                        modifier = Modifier.size(15.dp)
                                    )
                                    Spacer(modifier = Modifier.width(6.dp))
                                    Text(
                                        text = "O.S. SALVAS NO DISPOSITIVO (${uiState.filteredDrafts.size})",
                                        fontSize = 11.sp,
                                        fontWeight = FontWeight.Black,
                                        color = Color(0xFF1E40AF),
                                        letterSpacing = 0.4.sp
                                    )
                                }
                                Text(
                                    text = "Retenção: 7 dias",
                                    fontSize = 10.sp,
                                    fontWeight = FontWeight.Bold,
                                    color = TextSecondary
                                )
                            }
                        }

                        items(uiState.filteredDrafts, key = { "draft_${it.id}" }) { draft ->
                            val draftMissingReason = viewModel.validateDraftForBatch(draft)
                            val isDraftSelected = draft.id in selectedDraftIds
                            val sameLoc = lockedLocation == null || isSameBatchLocation(
                                lockedLocation,
                                draft.clientId,
                                draft.clientName,
                                draft.addressId,
                                draft.addressStreet
                            )
                            val canSelectDraft = draftMissingReason == null && sameLoc

                            SavedDraftOrderCard(
                                draft = draft,
                                isBatchMode = isBatchMode,
                                isSelected = isDraftSelected,
                                isSelectableInBatch = canSelectDraft,
                                incompleteReason = if (isBatchMode) draftMissingReason else null,
                                onContinueClick = {
                                    if (!isBatchMode) {
                                        onDraftClick(draft)
                                    } else {
                                        if (draftMissingReason != null) {
                                            Toast.makeText(
                                                context,
                                                "Complete esta O.S. antes de assinar em lote ($draftMissingReason).",
                                                Toast.LENGTH_LONG
                                            ).show()
                                        } else if (!sameLoc) {
                                            Toast.makeText(
                                                context,
                                                "Só é possível assinar em lote O.S. do mesmo cliente e endereço.",
                                                Toast.LENGTH_SHORT
                                            ).show()
                                        } else {
                                            selectedDraftIds = if (isDraftSelected) {
                                                selectedDraftIds - draft.id
                                            } else {
                                                selectedDraftIds + draft.id
                                            }
                                        }
                                    }
                                },
                                onDeleteClick = { draftPendingDelete = draft }
                            )
                        }

                        if (uiState.selectedTab == OSFilterTab.ALL && uiState.filteredOrders.isNotEmpty()) {
                            item(key = "header_today_orders") {
                                Row(
                                    modifier = Modifier
                                        .fillMaxWidth()
                                        .padding(top = 8.dp, bottom = 2.dp),
                                    verticalAlignment = Alignment.CenterVertically
                                ) {
                                    Icon(
                                        imageVector = Icons.Default.Assignment,
                                        contentDescription = null,
                                        tint = Color(0xFF581C87),
                                        modifier = Modifier.size(15.dp)
                                    )
                                    Spacer(modifier = Modifier.width(6.dp))
                                    Text(
                                        text = "ORDENS DE SERVIÇO DO DIA (${uiState.filteredOrders.size})",
                                        fontSize = 11.sp,
                                        fontWeight = FontWeight.Black,
                                        color = TextSecondary,
                                        letterSpacing = 0.4.sp
                                    )
                                }
                            }
                        }
                    }

                    if (uiState.selectedTab != OSFilterTab.DRAFTS) {
                        items(uiState.filteredOrders, key = { it.id }) { order ->
                            val isEligible = isOrderEligibleForBatch(order)
                            val isOrderSelected = order.id in selectedOrderIds
                            val sameLoc = lockedLocation == null || isSameBatchLocation(
                                lockedLocation,
                                order.clientId,
                                order.clientName,
                                order.addressId,
                                order.addressStreet
                            )
                            val canSelectOrder = isEligible && sameLoc

                            ServiceOrderItemCard(
                                order = order,
                                isBatchMode = isBatchMode,
                                isSelected = isOrderSelected,
                                isSelectableInBatch = canSelectOrder,
                                onClick = {
                                    if (!isBatchMode) {
                                        onOrderClick(order.id)
                                    } else {
                                        if (!isEligible) {
                                            Toast.makeText(
                                                context,
                                                "Esta O.S. já está concluída/cancelada e não entra no lote.",
                                                Toast.LENGTH_SHORT
                                            ).show()
                                        } else if (!sameLoc) {
                                            Toast.makeText(
                                                context,
                                                "Só é possível assinar em lote O.S. do mesmo cliente e endereço.",
                                                Toast.LENGTH_SHORT
                                            ).show()
                                        } else {
                                            selectedOrderIds = if (isOrderSelected) {
                                                selectedOrderIds - order.id
                                            } else {
                                                selectedOrderIds + order.id
                                            }
                                        }
                                    }
                                }
                            )
                        }
                    }
                }
            }
        }
    }

    draftPendingDelete?.let { draft ->
        AlertDialog(
            onDismissRequest = { draftPendingDelete = null },
            icon = {
                Icon(
                    imageVector = Icons.Default.DeleteOutline,
                    contentDescription = null,
                    tint = Color(0xFFDC2626)
                )
            },
            title = {
                Text(
                    text = "Excluir O.S. salva?",
                    fontWeight = FontWeight.Black,
                    fontSize = 16.sp,
                    color = TextPrimary
                )
            },
            text = {
                val label = draft.clientName.ifBlank { draft.addressStreet.ifBlank { "este rascunho" } }
                Text(
                    text = "Os dados preenchidos de \"$label\" serão removidos da memória do dispositivo e não poderão ser recuperados.",
                    fontSize = 13.sp,
                    color = TextSecondary
                )
            },
            confirmButton = {
                Button(
                    onClick = {
                        viewModel.deleteOrderDraft(draft.id)
                        draftPendingDelete = null
                    },
                    colors = ButtonDefaults.buttonColors(containerColor = Color(0xFFDC2626)),
                    shape = RoundedCornerShape(10.dp)
                ) {
                    Text("Excluir", fontWeight = FontWeight.Bold)
                }
            },
            dismissButton = {
                TextButton(onClick = { draftPendingDelete = null }) {
                    Text("Cancelar", fontWeight = FontWeight.Bold, color = TextSecondary)
                }
            }
        )
    }
}

@Composable
private fun SavedDraftOrderCard(
    draft: LocalServiceOrderDraft,
    isBatchMode: Boolean = false,
    isSelected: Boolean = false,
    isSelectableInBatch: Boolean = true,
    incompleteReason: String? = null,
    onContinueClick: () -> Unit,
    onDeleteClick: () -> Unit
) {
    val savedTimeLabel = remember(draft.updatedAtMillis) {
        SimpleDateFormat("dd/MM 'às' HH:mm", Locale.getDefault()).format(Date(draft.updatedAtMillis))
    }
    val expirationLabel = remember(draft.expiresAtMillis) {
        ServiceOrderDraftStorage.formatExpirationLabel(draft)
    }
    val remainingDays = remember(draft.expiresAtMillis) {
        ServiceOrderDraftStorage.remainingDays(draft)
    }
    val expirationBg = if (remainingDays <= 1) Color(0xFFFEE2E2) else Color(0xFFFEF3C7)
    val expirationColor = if (remainingDays <= 1) Color(0xFFDC2626) else Color(0xFFB45309)

    val summaryText = listOf(draft.description, draft.diagnosis, draft.solution)
        .firstOrNull { it.isNotBlank() }
        .orEmpty()

    val equipmentLine = draft.equipmentDisplay.ifBlank {
        buildString {
            if (draft.equipmentName.isNotBlank()) append(draft.equipmentName)
            if (draft.equipmentSector.isNotBlank()) {
                if (isNotEmpty()) append(" • ")
                append(draft.equipmentSector)
            }
            if (draft.equipmentBtus.isNotBlank()) {
                if (isNotEmpty()) append(" • ")
                append("${draft.equipmentBtus} BTUs")
            }
        }
    }

    val cardBorderColor = when {
        isBatchMode && isSelected -> Color(0xFF059669)
        isBatchMode && !isSelectableInBatch -> Color(0xFFE2E8F0)
        else -> Color(0xFF93C5FD)
    }
    val cardBgColor = if (isBatchMode && isSelected) Color(0xFFF0FDF4) else Color.White

    Card(
        modifier = Modifier
            .fillMaxWidth()
            .alpha(if (isBatchMode && !isSelectableInBatch && !isSelected) 0.52f else 1f)
            .clickable(onClick = onContinueClick),
        shape = RoundedCornerShape(16.dp),
        colors = CardDefaults.cardColors(containerColor = cardBgColor),
        border = BorderStroke(if (isBatchMode && isSelected) 2.dp else 1.3.dp, cardBorderColor),
        elevation = CardDefaults.cardElevation(defaultElevation = 2.dp)
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(14.dp)
        ) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(6.dp),
                    modifier = Modifier.weight(1f)
                ) {
                    if (isBatchMode) {
                        Checkbox(
                            checked = isSelected,
                            onCheckedChange = { onContinueClick() },
                            enabled = isSelectableInBatch || isSelected,
                            modifier = Modifier.size(24.dp),
                            colors = CheckboxDefaults.colors(
                                checkedColor = Color(0xFF059669),
                                uncheckedColor = Color(0xFF64748B)
                            )
                        )
                    }
                    Box(
                        modifier = Modifier
                            .clip(RoundedCornerShape(8.dp))
                            .background(Color(0xFFDBEAFE))
                            .padding(horizontal = 8.dp, vertical = 4.dp)
                    ) {
                        Text(
                            text = "SALVA NO APARELHO",
                            fontSize = 10.sp,
                            fontWeight = FontWeight.Black,
                            color = Color(0xFF1D4ED8),
                            maxLines = 1,
                            softWrap = false
                        )
                    }
                    Box(
                        modifier = Modifier
                            .clip(RoundedCornerShape(8.dp))
                            .background(expirationBg)
                            .padding(horizontal = 8.dp, vertical = 4.dp)
                    ) {
                        Text(
                            text = expirationLabel.uppercase(Locale.getDefault()),
                            fontSize = 9.sp,
                            fontWeight = FontWeight.Black,
                            color = expirationColor,
                            maxLines = 1,
                            softWrap = false
                        )
                    }
                }

                if (!isBatchMode) {
                    IconButton(
                        onClick = onDeleteClick,
                        modifier = Modifier.size(30.dp)
                    ) {
                        Icon(
                            imageVector = Icons.Default.DeleteOutline,
                            contentDescription = "Excluir O.S. salva",
                            tint = Color(0xFFDC2626),
                            modifier = Modifier.size(19.dp)
                        )
                    }
                }
            }

            if (!incompleteReason.isNullOrBlank()) {
                Spacer(modifier = Modifier.height(6.dp))
                Box(
                    modifier = Modifier
                        .fillMaxWidth()
                        .clip(RoundedCornerShape(8.dp))
                        .background(Color(0xFFFEF3C7))
                        .border(1.dp, Color(0xFFFDE68A), RoundedCornerShape(8.dp))
                        .padding(horizontal = 8.dp, vertical = 5.dp)
                ) {
                    Text(
                        text = "Incompleta para lote: $incompleteReason",
                        fontSize = 10.sp,
                        fontWeight = FontWeight.Bold,
                        color = Color(0xFF92400E)
                    )
                }
            }

            Spacer(modifier = Modifier.height(8.dp))

            Text(
                text = draft.clientName.ifBlank { "Cliente ainda não selecionado" },
                fontSize = 15.sp,
                fontWeight = FontWeight.Black,
                color = if (draft.clientName.isNotBlank()) TextPrimary else TextSecondary,
                maxLines = 2,
                overflow = TextOverflow.Ellipsis
            )

            if (draft.addressStreet.isNotBlank()) {
                Spacer(modifier = Modifier.height(4.dp))
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    verticalAlignment = Alignment.Top
                ) {
                    Icon(
                        imageVector = Icons.Default.LocationOn,
                        contentDescription = null,
                        tint = Color(0xFFDC2626),
                        modifier = Modifier
                            .size(14.dp)
                            .padding(top = 1.dp)
                    )
                    Spacer(modifier = Modifier.width(4.dp))
                    Text(
                        text = draft.addressStreet,
                        fontSize = 12.sp,
                        color = TextSecondary,
                        lineHeight = 16.sp,
                        maxLines = 2,
                        overflow = TextOverflow.Ellipsis
                    )
                }
            }

            if (equipmentLine.isNotBlank()) {
                Spacer(modifier = Modifier.height(6.dp))
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Icon(
                        imageVector = Icons.Default.AcUnit,
                        contentDescription = null,
                        tint = Color(0xFF1D4ED8),
                        modifier = Modifier.size(14.dp)
                    )
                    Spacer(modifier = Modifier.width(5.dp))
                    Text(
                        text = equipmentLine,
                        fontSize = 12.sp,
                        fontWeight = FontWeight.Bold,
                        color = Color(0xFF1E3A8A),
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis
                    )
                }
            }

            if (summaryText.isNotBlank()) {
                Spacer(modifier = Modifier.height(8.dp))
                Box(
                    modifier = Modifier
                        .fillMaxWidth()
                        .clip(RoundedCornerShape(8.dp))
                        .background(Color(0xFFF8FAFC))
                        .border(1.dp, Color(0xFFE2E8F0), RoundedCornerShape(8.dp))
                        .padding(horizontal = 10.dp, vertical = 7.dp)
                ) {
                    Text(
                        text = summaryText,
                        fontSize = 12.sp,
                        color = TextPrimary,
                        lineHeight = 16.sp,
                        maxLines = 2,
                        overflow = TextOverflow.Ellipsis
                    )
                }
            }

            if (draft.photoPaths.isNotEmpty()) {
                Spacer(modifier = Modifier.height(6.dp))
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Icon(
                        imageVector = Icons.Default.PhotoCamera,
                        contentDescription = null,
                        tint = BluePrimary,
                        modifier = Modifier.size(13.dp)
                    )
                    Spacer(modifier = Modifier.width(4.dp))
                    Text(
                        text = if (draft.photoPaths.size == 1) "1 foto anexada" else "${draft.photoPaths.size} fotos anexadas",
                        fontSize = 11.sp,
                        fontWeight = FontWeight.Bold,
                        color = BluePrimary
                    )
                }
            }

            Spacer(modifier = Modifier.height(10.dp))
            HorizontalDivider(color = Color(0xFFEFF6FF), thickness = 1.dp)
            Spacer(modifier = Modifier.height(8.dp))

            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Row(
                    modifier = Modifier.weight(1f),
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Icon(
                        imageVector = Icons.Default.Schedule,
                        contentDescription = null,
                        tint = TextSecondary,
                        modifier = Modifier.size(14.dp)
                    )
                    Spacer(modifier = Modifier.width(5.dp))
                    Text(
                        text = "Salva em $savedTimeLabel",
                        fontSize = 11.sp,
                        color = TextSecondary,
                        fontWeight = FontWeight.SemiBold,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis
                    )
                }

                Spacer(modifier = Modifier.width(8.dp))

                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text(
                        text = "Continuar O.S.",
                        fontSize = 12.sp,
                        fontWeight = FontWeight.Black,
                        color = Color(0xFF1D4ED8),
                        maxLines = 1,
                        softWrap = false
                    )
                    Spacer(modifier = Modifier.width(2.dp))
                    Icon(
                        imageVector = Icons.Default.ChevronRight,
                        contentDescription = null,
                        tint = Color(0xFF1D4ED8),
                        modifier = Modifier.size(16.dp)
                    )
                }
            }
        }
    }
}

@Composable
private fun MetricMiniCard(
    title: String,
    count: Int,
    bgColor: Color,
    textColor: Color,
    modifier: Modifier = Modifier
) {
    Card(
        modifier = modifier,
        shape = RoundedCornerShape(12.dp),
        colors = CardDefaults.cardColors(containerColor = bgColor),
        border = BorderStroke(1.dp, textColor.copy(alpha = 0.12f)),
        elevation = CardDefaults.cardElevation(defaultElevation = 0.dp)
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 4.dp, vertical = 8.dp),
            horizontalAlignment = Alignment.CenterHorizontally
        ) {
            Text(
                text = "$count",
                fontSize = 18.sp,
                fontWeight = FontWeight.Black,
                color = textColor,
                maxLines = 1
            )
            Text(
                text = title,
                fontSize = 10.sp,
                fontWeight = FontWeight.Bold,
                color = textColor.copy(alpha = 0.85f),
                maxLines = 1,
                softWrap = false,
                overflow = TextOverflow.Ellipsis
            )
        }
    }
}

@Composable
private fun FilterTabChip(
    label: String,
    isSelected: Boolean,
    highlightAccent: Boolean = false,
    onClick: () -> Unit,
    modifier: Modifier = Modifier
) {
    val shape = RoundedCornerShape(10.dp)
    val bgColor = when {
        isSelected -> BluePrimary
        highlightAccent -> Color(0xFFEFF6FF)
        else -> Color.White
    }
    val borderColor = when {
        isSelected -> BluePrimary
        highlightAccent -> Color(0xFF93C5FD)
        else -> Color(0xFFE2E8F0)
    }
    val labelColor = when {
        isSelected -> Color.White
        highlightAccent -> Color(0xFF1D4ED8)
        else -> TextSecondary
    }
    Box(
        modifier = modifier
            .clip(shape)
            .background(bgColor)
            .border(
                width = 1.dp,
                color = borderColor,
                shape = shape
            )
            .clickable(onClick = onClick)
            .padding(horizontal = 12.dp, vertical = 9.dp),
        contentAlignment = Alignment.Center
    ) {
        Text(
            text = label,
            fontSize = 11.sp,
            fontWeight = if (isSelected || highlightAccent) FontWeight.Black else FontWeight.SemiBold,
            color = labelColor,
            maxLines = 1,
            softWrap = false,
            overflow = TextOverflow.Ellipsis
        )
    }
}

@Composable
private fun ServiceOrderItemCard(
    order: ServiceOrderEntity,
    isBatchMode: Boolean = false,
    isSelected: Boolean = false,
    isSelectableInBatch: Boolean = true,
    onClick: () -> Unit
) {
    val statusColor = when (order.status) {
        "finalizada", "pre_finalizada" -> Color(0xFF15803D)
        "em_andamento" -> Color(0xFFB45309)
        "cancelada" -> Color(0xFFDC2626)
        else -> Color(0xFF1D4ED8)
    }
    val statusBg = when (order.status) {
        "finalizada", "pre_finalizada" -> Color(0xFFDCFCE7)
        "em_andamento" -> Color(0xFFFEF3C7)
        "cancelada" -> Color(0xFFFEE2E2)
        else -> Color(0xFFEFF6FF)
    }
    val statusLabel = when (order.status) {
        "finalizada" -> "CONCLUÍDA"
        "pre_finalizada" -> "PRÉ-FINALIZADA"
        "em_andamento" -> "EM ATENDIMENTO"
        "cancelada" -> "CANCELADA"
        else -> "ABERTA"
    }

    val displayDate = DateTimeUtils.formatDisplayDate(order.plannedDate)
        .ifBlank { "Data a definir" }

    val formattedAddress = buildString {
        append(order.addressStreet.trim())
        if (!order.addressNumber.isNullOrBlank() && !order.addressStreet.contains(order.addressNumber.trim())) {
            append(", ${order.addressNumber.trim()}")
        }
        if (!order.addressCity.isNullOrBlank() && !order.addressStreet.contains(order.addressCity.trim(), ignoreCase = true)) {
            append(" - ${order.addressCity.trim()}")
        }
    }

    val cardBorderColor = when {
        isBatchMode && isSelected -> Color(0xFF059669)
        else -> Color(0xFFE2E8F0)
    }
    val cardBgColor = if (isBatchMode && isSelected) Color(0xFFF0FDF4) else Color.White

    Card(
        modifier = Modifier
            .fillMaxWidth()
            .alpha(if (isBatchMode && !isSelectableInBatch && !isSelected) 0.45f else 1f)
            .clickable(onClick = onClick),
        shape = RoundedCornerShape(16.dp),
        colors = CardDefaults.cardColors(containerColor = cardBgColor),
        border = BorderStroke(if (isBatchMode && isSelected) 2.dp else 1.dp, cardBorderColor),
        elevation = CardDefaults.cardElevation(defaultElevation = 1.5.dp)
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(14.dp)
        ) {
            // Linha 1: Número da O.S. (esquerda) e Badge de Status (direita, sem quebra vertical)
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                    modifier = Modifier.weight(1f, fill = false)
                ) {
                    if (isBatchMode) {
                        Checkbox(
                            checked = isSelected,
                            onCheckedChange = { onClick() },
                            enabled = isSelectableInBatch || isSelected,
                            modifier = Modifier.size(24.dp),
                            colors = CheckboxDefaults.colors(
                                checkedColor = Color(0xFF059669),
                                uncheckedColor = Color(0xFF64748B)
                            )
                        )
                    }
                    Box(
                        modifier = Modifier
                            .clip(RoundedCornerShape(8.dp))
                            .background(Color(0xFF581C87).copy(alpha = 0.12f))
                            .padding(horizontal = 9.dp, vertical = 4.dp)
                    ) {
                        Text(
                            text = "#${order.osNumber}",
                            fontSize = 12.sp,
                            fontWeight = FontWeight.Black,
                            color = Color(0xFF581C87),
                            maxLines = 1,
                            softWrap = false,
                            overflow = TextOverflow.Ellipsis
                        )
                    }
                }

                Spacer(modifier = Modifier.width(8.dp))

                Box(
                    modifier = Modifier
                        .clip(RoundedCornerShape(8.dp))
                        .background(statusBg)
                        .padding(horizontal = 9.dp, vertical = 4.dp)
                ) {
                    Text(
                        text = statusLabel,
                        fontSize = 10.sp,
                        fontWeight = FontWeight.Black,
                        color = statusColor,
                        maxLines = 1,
                        softWrap = false
                    )
                }
            }

            // Linha 2: Tipo da Manutenção em linha dedicada (evita esmagar a badge de status)
            if (order.type.isNotBlank()) {
                Spacer(modifier = Modifier.height(7.dp))
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Icon(
                        imageVector = Icons.Default.Build,
                        contentDescription = null,
                        tint = Color(0xFF64748B),
                        modifier = Modifier.size(12.dp)
                    )
                    Spacer(modifier = Modifier.width(5.dp))
                    Text(
                        text = order.type.uppercase(),
                        fontSize = 10.sp,
                        fontWeight = FontWeight.Bold,
                        color = TextSecondary,
                        letterSpacing = 0.3.sp,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis
                    )
                }
            }

            Spacer(modifier = Modifier.height(8.dp))

            // Nome do Cliente
            Text(
                text = order.clientName,
                fontSize = 15.sp,
                fontWeight = FontWeight.Black,
                color = TextPrimary,
                maxLines = 2,
                overflow = TextOverflow.Ellipsis
            )

            Spacer(modifier = Modifier.height(4.dp))

            // Endereço
            Row(
                modifier = Modifier.fillMaxWidth(),
                verticalAlignment = Alignment.Top
            ) {
                Icon(
                    imageVector = Icons.Default.LocationOn,
                    contentDescription = null,
                    tint = Color(0xFFDC2626),
                    modifier = Modifier
                        .size(14.dp)
                        .padding(top = 1.dp)
                )
                Spacer(modifier = Modifier.width(4.dp))
                Text(
                    text = formattedAddress,
                    fontSize = 12.sp,
                    color = TextSecondary,
                    lineHeight = 16.sp,
                    maxLines = 2,
                    overflow = TextOverflow.Ellipsis
                )
            }

            // Descrição ou Observações
            if (!order.generalNotes.isNullOrBlank()) {
                Spacer(modifier = Modifier.height(8.dp))
                Box(
                    modifier = Modifier
                        .fillMaxWidth()
                        .clip(RoundedCornerShape(8.dp))
                        .background(Color(0xFFF8FAFC))
                        .border(1.dp, Color(0xFFE2E8F0), RoundedCornerShape(8.dp))
                        .padding(horizontal = 10.dp, vertical = 8.dp)
                ) {
                    Text(
                        text = order.generalNotes,
                        fontSize = 12.sp,
                        color = TextPrimary,
                        lineHeight = 16.sp,
                        maxLines = 2,
                        overflow = TextOverflow.Ellipsis
                    )
                }
            }

            Spacer(modifier = Modifier.height(10.dp))
            HorizontalDivider(color = Color(0xFFF1F5F9), thickness = 1.dp)
            Spacer(modifier = Modifier.height(8.dp))

            // Linha Inferior com Data e Ação
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Row(
                    modifier = Modifier.weight(1f),
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Icon(
                        imageVector = Icons.Default.Event,
                        contentDescription = null,
                        tint = TextSecondary,
                        modifier = Modifier.size(14.dp)
                    )
                    Spacer(modifier = Modifier.width(5.dp))
                    Text(
                        text = displayDate,
                        fontSize = 11.sp,
                        color = TextSecondary,
                        fontWeight = FontWeight.SemiBold,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis
                    )
                }

                Spacer(modifier = Modifier.width(8.dp))

                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text(
                        text = if (order.status == "finalizada" || order.status == "pre_finalizada") "Ver Detalhes" else "Atender O.S.",
                        fontSize = 12.sp,
                        fontWeight = FontWeight.Black,
                        color = BluePrimary,
                        maxLines = 1,
                        softWrap = false
                    )
                    Spacer(modifier = Modifier.width(2.dp))
                    Icon(
                        imageVector = Icons.Default.ChevronRight,
                        contentDescription = null,
                        tint = BluePrimary,
                        modifier = Modifier.size(16.dp)
                    )
                }
            }
        }
    }
}
