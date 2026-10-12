package com.lefrio.atendimento.ui.serviceorders

import android.widget.Toast
import androidx.compose.animation.core.*
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.rotate
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.lefrio.atendimento.data.local.entity.ServiceOrderEntity
import com.lefrio.atendimento.data.local.entity.TechnicianEntity
import com.lefrio.atendimento.ui.serviceorders.components.CreateServiceOrderDialog
import com.lefrio.atendimento.ui.theme.BluePrimary
import com.lefrio.atendimento.ui.theme.TextPrimary
import com.lefrio.atendimento.ui.theme.TextSecondary

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ServiceOrdersScreen(
    user: TechnicianEntity,
    viewModel: ServiceOrdersViewModel,
    onMenuClick: () -> Unit,
    onOrderClick: (orderId: String) -> Unit,
    onProfileClick: () -> Unit
) {
    val uiState by viewModel.uiState.collectAsState()
    val context = LocalContext.current

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
                            text = "Ordens de Serviço",
                            fontSize = 17.sp,
                            fontWeight = FontWeight.Black,
                            color = BluePrimary
                        )
                        Text(
                            text = "Gestão de O.S. e Chamados • ${user.name}",
                            fontSize = 11.sp,
                            color = TextSecondary,
                            fontWeight = FontWeight.Medium
                        )
                    }
                },
                navigationIcon = {
                    IconButton(onClick = onMenuClick) {
                        Icon(
                            imageVector = Icons.Default.Menu,
                            contentDescription = "Abrir Menu",
                            tint = BluePrimary
                        )
                    }
                },
                actions = {
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
                },
                colors = TopAppBarDefaults.topAppBarColors(containerColor = Color.White)
            )
        },
        floatingActionButton = {
            ExtendedFloatingActionButton(
                onClick = { viewModel.openCreateModal() },
                icon = { Icon(Icons.Default.Add, contentDescription = null, tint = Color.White) },
                text = { Text("NOVA O.S.", fontWeight = FontWeight.Black, fontSize = 13.sp, color = Color.White) },
                containerColor = Color(0xFF581C87), // Roxo do botão de Nova O.S. PWA
                contentColor = Color.White,
                shape = RoundedCornerShape(16.dp),
                elevation = FloatingActionButtonDefaults.elevation(defaultElevation = 6.dp)
            )
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
                    title = "Abertas",
                    count = uiState.openCount,
                    bgColor = Color(0xFFEFF6FF),
                    textColor = Color(0xFF1D4ED8),
                    modifier = Modifier.weight(1f)
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
                onValueChange = { viewModel.setSearchQuery(it) },
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = 14.dp, vertical = 4.dp),
                placeholder = { Text("Buscar por O.S., cliente, endereço ou tipo...", fontSize = 12.sp) },
                leadingIcon = {
                    Icon(Icons.Default.Search, contentDescription = null, tint = TextSecondary, modifier = Modifier.size(18.dp))
                },
                trailingIcon = {
                    if (uiState.searchQuery.isNotBlank()) {
                        IconButton(onClick = { viewModel.setSearchQuery("") }) {
                            Icon(Icons.Default.Close, contentDescription = "Limpar busca", tint = TextSecondary, modifier = Modifier.size(16.dp))
                        }
                    }
                },
                shape = RoundedCornerShape(12.dp),
                colors = OutlinedTextFieldDefaults.colors(
                    focusedContainerColor = Color.White,
                    unfocusedContainerColor = Color.White
                ),
                singleLine = true
            )

            // 3. ABAS DE FILTRO POR STATUS
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = 14.dp, vertical = 6.dp),
                horizontalArrangement = Arrangement.spacedBy(6.dp)
            ) {
                FilterTabChip(
                    label = "Todas (${uiState.totalCount})",
                    isSelected = uiState.selectedTab == OSFilterTab.ALL,
                    onClick = { viewModel.setFilterTab(OSFilterTab.ALL) },
                    modifier = Modifier.weight(1f)
                )
                FilterTabChip(
                    label = "Abertas (${uiState.openCount})",
                    isSelected = uiState.selectedTab == OSFilterTab.OPEN,
                    onClick = { viewModel.setFilterTab(OSFilterTab.OPEN) },
                    modifier = Modifier.weight(1f)
                )
                FilterTabChip(
                    label = "Em Rota (${uiState.inProgressCount})",
                    isSelected = uiState.selectedTab == OSFilterTab.IN_PROGRESS,
                    onClick = { viewModel.setFilterTab(OSFilterTab.IN_PROGRESS) },
                    modifier = Modifier.weight(1f)
                )
                FilterTabChip(
                    label = "Feitas (${uiState.finishedCount})",
                    isSelected = uiState.selectedTab == OSFilterTab.FINISHED,
                    onClick = { viewModel.setFilterTab(OSFilterTab.FINISHED) },
                    modifier = Modifier.weight(1f)
                )
            }

            // 4. LISTA DE ORDENS DE SERVIÇO
            if (uiState.filteredOrders.isEmpty()) {
                Box(
                    modifier = Modifier
                        .fillMaxSize()
                        .padding(24.dp),
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
                                .background(Color(0xFFEDE9FE)),
                            contentAlignment = Alignment.Center
                        ) {
                            Icon(
                                imageVector = Icons.Default.Assignment,
                                contentDescription = null,
                                tint = Color(0xFF6B21A8),
                                modifier = Modifier.size(32.dp)
                            )
                        }
                        Spacer(modifier = Modifier.height(14.dp))
                        Text(
                            text = "Nenhuma O.S. encontrada",
                            fontSize = 15.sp,
                            fontWeight = FontWeight.Bold,
                            color = TextPrimary
                        )
                        Spacer(modifier = Modifier.height(4.dp))
                        Text(
                            text = "Clique em '+ NOVA O.S.' abaixo para criar uma ordem de serviço diretamente no seu roteiro.",
                            fontSize = 12.sp,
                            color = TextSecondary,
                            textAlign = androidx.compose.ui.text.style.TextAlign.Center
                        )
                    }
                }
            } else {
                LazyColumn(
                    modifier = Modifier.fillMaxSize(),
                    contentPadding = PaddingValues(horizontal = 14.dp, top = 6.dp, bottom = 80.dp),
                    verticalArrangement = Arrangement.spacedBy(10.dp)
                ) {
                    items(uiState.filteredOrders, key = { it.id }) { order ->
                        ServiceOrderItemCard(
                            order = order,
                            onClick = { onOrderClick(order.id) }
                        )
                    }
                }
            }
        }
    }

    // MODAL DE CRIAÇÃO DE NOVA ORDEM DE SERVIÇO
    if (uiState.isCreateModalOpen) {
        CreateServiceOrderDialog(
            currentUser = user,
            clients = uiState.clients,
            addresses = uiState.addresses,
            equipments = uiState.equipments,
            technicians = uiState.technicians,
            onAddressSelected = { addrId ->
                viewModel.loadEquipmentsForAddress(addrId)
            },
            onDismissRequest = { viewModel.closeCreateModal() },
            onConfirmCreate = { date, type, clientId, clientName, addressId, addressStreet, equipmentId, equipmentName, tech2Name, desc ->
                viewModel.createServiceOrder(
                    date = date,
                    type = type,
                    clientId = clientId,
                    clientName = clientName,
                    addressId = addressId,
                    addressStreet = addressStreet,
                    equipmentId = equipmentId,
                    equipmentName = equipmentName,
                    tech2Name = tech2Name,
                    description = desc,
                    onSuccess = { createdId ->
                        Toast.makeText(context, "Ordem de Serviço criada e agendada com sucesso!", Toast.LENGTH_LONG).show()
                        onOrderClick(createdId)
                    },
                    onError = { err ->
                        Toast.makeText(context, err, Toast.LENGTH_LONG).show()
                    }
                )
            }
        )
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
        elevation = CardDefaults.cardElevation(defaultElevation = 1.dp)
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(vertical = 8.dp),
            horizontalAlignment = Alignment.CenterHorizontally
        ) {
            Text(
                text = "$count",
                fontSize = 18.sp,
                fontWeight = FontWeight.Black,
                color = textColor
            )
            Text(
                text = title,
                fontSize = 10.sp,
                fontWeight = FontWeight.Bold,
                color = textColor.copy(alpha = 0.8f)
            )
        }
    }
}

@Composable
private fun FilterTabChip(
    label: String,
    isSelected: Boolean,
    onClick: () -> Unit,
    modifier: Modifier = Modifier
) {
    Box(
        modifier = modifier
            .clip(RoundedCornerShape(10.dp))
            .background(if (isSelected) BluePrimary else Color.White)
            .clickable(onClick = onClick)
            .padding(vertical = 8.dp),
        contentAlignment = Alignment.Center
    ) {
        Text(
            text = label,
            fontSize = 11.sp,
            fontWeight = if (isSelected) FontWeight.Black else FontWeight.SemiBold,
            color = if (isSelected) Color.White else TextSecondary
        )
    }
}

@Composable
private fun ServiceOrderItemCard(
    order: ServiceOrderEntity,
    onClick: () -> Unit
) {
    val statusColor = when (order.status) {
        "finalizada" -> Color(0xFF15803D)
        "em_andamento" -> Color(0xFFB45309)
        else -> Color(0xFF1D4ED8)
    }
    val statusBg = when (order.status) {
        "finalizada" -> Color(0xFFDCFCE7)
        "em_andamento" -> Color(0xFFFEF3C7)
        else -> Color(0xFFEFF6FF)
    }
    val statusLabel = when (order.status) {
        "finalizada" -> "CONCLUÍDA"
        "em_andamento" -> "EM ATENDIMENTO"
        else -> "ABERTA"
    }

    Card(
        modifier = Modifier
            .fillMaxWidth()
            .clickable(onClick = onClick),
        shape = RoundedCornerShape(16.dp),
        colors = CardDefaults.cardColors(containerColor = Color.White),
        elevation = CardDefaults.cardElevation(defaultElevation = 2.dp)
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(14.dp)
        ) {
            // Linha Superior: Número da O.S. e Badge de Status
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Box(
                        modifier = Modifier
                            .clip(RoundedCornerShape(8.dp))
                            .background(Color(0xFF581C87).copy(alpha = 0.12f))
                            .padding(horizontal = 8.dp, vertical = 4.dp)
                    ) {
                        Text(
                            text = "#${order.osNumber}",
                            fontSize = 12.sp,
                            fontWeight = FontWeight.Black,
                            color = Color(0xFF581C87)
                        )
                    }
                    Spacer(modifier = Modifier.width(8.dp))
                    Text(
                        text = order.type,
                        fontSize = 10.sp,
                        fontWeight = FontWeight.Bold,
                        color = TextSecondary,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis
                    )
                }

                Box(
                    modifier = Modifier
                        .clip(RoundedCornerShape(8.dp))
                        .background(statusBg)
                        .padding(horizontal = 8.dp, vertical = 3.dp)
                ) {
                    Text(
                        text = statusLabel,
                        fontSize = 10.sp,
                        fontWeight = FontWeight.Black,
                        color = statusColor
                    )
                }
            }

            Spacer(modifier = Modifier.height(10.dp))

            // Nome do Cliente
            Text(
                text = order.clientName,
                fontSize = 14.sp,
                fontWeight = FontWeight.Black,
                color = TextPrimary
            )

            Spacer(modifier = Modifier.height(4.dp))

            // Endereço
            Row(verticalAlignment = Alignment.CenterVertically) {
                Icon(
                    imageVector = Icons.Default.LocationOn,
                    contentDescription = null,
                    tint = Color(0xFFDC2626),
                    modifier = Modifier.size(14.dp)
                )
                Spacer(modifier = Modifier.width(4.dp))
                Text(
                    text = order.addressStreet,
                    fontSize = 11.sp,
                    color = TextSecondary,
                    maxLines = 1,
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
                        .padding(8.dp)
                ) {
                    Text(
                        text = order.generalNotes,
                        fontSize = 11.sp,
                        color = TextPrimary,
                        maxLines = 2,
                        overflow = TextOverflow.Ellipsis
                    )
                }
            }

            Spacer(modifier = Modifier.height(10.dp))

            // Linha Inferior com Data e Botão
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Icon(
                        imageVector = Icons.Default.Event,
                        contentDescription = null,
                        tint = TextSecondary,
                        modifier = Modifier.size(13.dp)
                    )
                    Spacer(modifier = Modifier.width(4.dp))
                    Text(
                        text = order.plannedDate ?: "Data a definir",
                        fontSize = 11.sp,
                        color = TextSecondary,
                        fontWeight = FontWeight.Medium
                    )
                }

                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text(
                        text = if (order.status == "finalizada") "Ver Detalhes" else "Atender O.S.",
                        fontSize = 12.sp,
                        fontWeight = FontWeight.Black,
                        color = BluePrimary
                    )
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
