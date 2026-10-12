package com.lefrio.atendimento.ui.components

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.lefrio.atendimento.data.local.entity.TechnicianEntity
import com.lefrio.atendimento.ui.theme.BluePrimary
import com.lefrio.atendimento.ui.theme.TextPrimary
import com.lefrio.atendimento.ui.theme.TextSecondary

enum class DrawerDestination {
    ROTEIRO,
    SERVICE_ORDERS,
    NEW_OS,
    EXPENSES,
    NOTIFICATIONS,
    PROFILE
}

@Composable
fun AppDrawerContent(
    currentDestination: DrawerDestination,
    user: TechnicianEntity,
    appVersion: String,
    unreadNotificationsCount: Int = 0,
    pendingSyncCount: Int = 0,
    onNavigate: (DrawerDestination) -> Unit,
    onForceSyncClick: () -> Unit,
    onLogoutClick: () -> Unit
) {
    ModalDrawerSheet(
        modifier = Modifier.width(310.dp),
        drawerShape = RoundedCornerShape(topEnd = 24.dp, bottomEnd = 24.dp),
        drawerContainerColor = Color.White
    ) {
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(vertical = 16.dp)
        ) {
            // 1. CABEÇALHO DO MENU LATERAL
            Box(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = 20.dp, vertical = 8.dp)
            ) {
                Column {
                    Row(
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(12.dp)
                    ) {
                        Box(
                            modifier = Modifier
                                .size(52.dp)
                                .clip(CircleShape)
                                .background(BluePrimary),
                            contentAlignment = Alignment.Center
                        ) {
                            Text(
                                text = user.name.take(2).uppercase(),
                                color = Color.White,
                                fontWeight = FontWeight.Black,
                                fontSize = 18.sp
                            )
                        }

                        Column {
                            Text(
                                text = "LeFrio Climatização",
                                fontSize = 12.sp,
                                fontWeight = FontWeight.Bold,
                                color = BluePrimary
                            )
                            Text(
                                text = user.name,
                                fontSize = 15.sp,
                                fontWeight = FontWeight.Black,
                                color = TextPrimary
                            )
                            Text(
                                text = "Técnico Especialista",
                                fontSize = 11.sp,
                                color = TextSecondary
                            )
                        }
                    }

                    Spacer(modifier = Modifier.height(14.dp))

                    // Badge de Status e Sync
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.spacedBy(8.dp)
                    ) {
                        Box(
                            modifier = Modifier
                                .clip(RoundedCornerShape(8.dp))
                                .background(Color(0xFFDCFCE7))
                                .padding(horizontal = 8.dp, vertical = 3.dp)
                        ) {
                            Row(verticalAlignment = Alignment.CenterVertically) {
                                Box(
                                    modifier = Modifier
                                        .size(6.dp)
                                        .clip(CircleShape)
                                        .background(Color(0xFF16A34A))
                                )
                                Spacer(modifier = Modifier.width(5.dp))
                                Text(
                                    text = "Conectado",
                                    fontSize = 10.sp,
                                    fontWeight = FontWeight.Bold,
                                    color = Color(0xFF15803D)
                                )
                            }
                        }

                        if (pendingSyncCount > 0) {
                            Box(
                                modifier = Modifier
                                    .clip(RoundedCornerShape(8.dp))
                                    .background(Color(0xFFFEF3C7))
                                    .padding(horizontal = 8.dp, vertical = 3.dp)
                            ) {
                                Text(
                                    text = "$pendingSyncCount pendentes",
                                    fontSize = 10.sp,
                                    fontWeight = FontWeight.Bold,
                                    color = Color(0xFFB45309)
                                )
                            }
                        }
                    }
                }
            }

            Spacer(modifier = Modifier.height(10.dp))
            Divider(color = Color(0xFFF1F5F9), thickness = 1.dp)
            Spacer(modifier = Modifier.height(10.dp))

            // 2. ITENS DE NAVEGAÇÃO
            Column(
                modifier = Modifier
                    .weight(1f)
                    .padding(horizontal = 12.dp),
                verticalArrangement = Arrangement.spacedBy(4.dp)
            ) {
                DrawerNavigationItem(
                    title = "Roteiro de Atendimentos",
                    subtitle = "Preventivas PMOC do Dia",
                    icon = Icons.Default.Route,
                    isSelected = currentDestination == DrawerDestination.ROTEIRO,
                    onClick = { onNavigate(DrawerDestination.ROTEIRO) }
                )

                DrawerNavigationItem(
                    title = "Ordens de Serviço",
                    subtitle = "Gestão de O.S. e Chamados",
                    icon = Icons.Default.Assignment,
                    badgeCount = null,
                    badgeColor = Color(0xFF581C87),
                    isSelected = currentDestination == DrawerDestination.SERVICE_ORDERS,
                    onClick = { onNavigate(DrawerDestination.SERVICE_ORDERS) }
                )

                DrawerNavigationItem(
                    title = "Criar Nova O.S.",
                    subtitle = "Agendar Chamado Corretivo",
                    icon = Icons.Default.AddCircle,
                    iconTint = Color(0xFF581C87),
                    isSelected = false,
                    onClick = { onNavigate(DrawerDestination.NEW_OS) }
                )

                DrawerNavigationItem(
                    title = "Despesas de Rota",
                    subtitle = "Combustível, Refeição e Outros",
                    icon = Icons.Default.ReceiptLong,
                    iconTint = Color(0xFF059669),
                    isSelected = currentDestination == DrawerDestination.EXPENSES,
                    onClick = { onNavigate(DrawerDestination.EXPENSES) }
                )

                DrawerNavigationItem(
                    title = "Notificações",
                    subtitle = "Avisos e Informes Técnicos",
                    icon = Icons.Default.Notifications,
                    badgeCount = if (unreadNotificationsCount > 0) unreadNotificationsCount else null,
                    isSelected = currentDestination == DrawerDestination.NOTIFICATIONS,
                    onClick = { onNavigate(DrawerDestination.NOTIFICATIONS) }
                )

                DrawerNavigationItem(
                    title = "Meu Perfil",
                    subtitle = "Dados do Técnico e Ajustes",
                    icon = Icons.Default.AccountCircle,
                    isSelected = currentDestination == DrawerDestination.PROFILE,
                    onClick = { onNavigate(DrawerDestination.PROFILE) }
                )

                Spacer(modifier = Modifier.height(6.dp))
                Divider(color = Color(0xFFF1F5F9), thickness = 1.dp)
                Spacer(modifier = Modifier.height(6.dp))

                DrawerNavigationItem(
                    title = "Sincronizar Agora",
                    subtitle = "Atualizar com a Nuvem",
                    icon = Icons.Default.Sync,
                    iconTint = BluePrimary,
                    isSelected = false,
                    onClick = onForceSyncClick
                )
            }

            // 3. RODAPÉ DO MENU
            Divider(color = Color(0xFFF1F5F9), thickness = 1.dp)
            Spacer(modifier = Modifier.height(10.dp))

            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = 16.dp)
            ) {
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .clip(RoundedCornerShape(12.dp))
                        .clickable(onClick = onLogoutClick)
                        .padding(horizontal = 12.dp, vertical = 8.dp),
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Icon(
                        imageVector = Icons.Default.ExitToApp,
                        contentDescription = "Sair",
                        tint = Color(0xFFDC2626),
                        modifier = Modifier.size(20.dp)
                    )
                    Spacer(modifier = Modifier.width(10.dp))
                    Text(
                        text = "Trocar Técnico / Sair",
                        fontSize = 13.sp,
                        fontWeight = FontWeight.Bold,
                        color = Color(0xFFDC2626)
                    )
                }

                Spacer(modifier = Modifier.height(4.dp))

                Text(
                    text = "App LeFrio • Versão $appVersion",
                    fontSize = 10.sp,
                    color = TextSecondary,
                    modifier = Modifier.padding(start = 12.dp)
                )
            }
        }
    }
}

@Composable
private fun DrawerNavigationItem(
    title: String,
    subtitle: String,
    icon: ImageVector,
    iconTint: Color = BluePrimary,
    badgeCount: Int? = null,
    badgeColor: Color = Color(0xFFDC2626),
    isSelected: Boolean,
    onClick: () -> Unit
) {
    val bgColor = if (isSelected) BluePrimary.copy(alpha = 0.12f) else Color.Transparent
    val titleColor = if (isSelected) BluePrimary else TextPrimary

    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(14.dp))
            .background(bgColor)
            .clickable(onClick = onClick)
            .padding(horizontal = 12.dp, vertical = 10.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        Box(
            modifier = Modifier
                .size(36.dp)
                .clip(RoundedCornerShape(10.dp))
                .background(if (isSelected) BluePrimary else iconTint.copy(alpha = 0.1f)),
            contentAlignment = Alignment.Center
        ) {
            Icon(
                imageVector = icon,
                contentDescription = null,
                tint = if (isSelected) Color.White else iconTint,
                modifier = Modifier.size(20.dp)
            )
        }

        Spacer(modifier = Modifier.width(12.dp))

        Column(modifier = Modifier.weight(1f)) {
            Text(
                text = title,
                fontSize = 13.sp,
                fontWeight = if (isSelected) FontWeight.Black else FontWeight.Bold,
                color = titleColor
            )
            Text(
                text = subtitle,
                fontSize = 10.sp,
                color = TextSecondary
            )
        }

        if (badgeCount != null) {
            Box(
                modifier = Modifier
                    .clip(CircleShape)
                    .background(badgeColor)
                    .padding(horizontal = 7.dp, vertical = 2.dp)
            ) {
                Text(
                    text = "$badgeCount",
                    color = Color.White,
                    fontSize = 10.sp,
                    fontWeight = FontWeight.Bold
                )
            }
        }
    }
}
