package com.lefrio.atendimento.ui.dashboard.components

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.lefrio.atendimento.data.local.entity.ServiceOrderEntity
import com.lefrio.atendimento.ui.theme.*

@Composable
fun ServiceOrderCard(
    order: ServiceOrderEntity,
    stopIndex: Int? = null,
    completedMachines: Int = 0,
    totalMachines: Int = 0,
    onClick: () -> Unit
) {
    val isPreventive = order.type.contains("PREVENTIVA", ignoreCase = true)

    val (statusLabel, statusBg, statusText) = when (order.status) {
        "aberta" -> Triple("Pendente", Color(0xFFEFF6FF), StatusOpen)
        "em_andamento" -> Triple("Em Atendimento", Color(0xFFFEF3C7), StatusProgress)
        "finalizada" -> Triple("Finalizada", Color(0xFFD1FAE5), StatusCompleted)
        else -> Triple(order.status.uppercase(), Color(0xFFF1F5F9), TextSecondary)
    }

    Card(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = 14.dp, vertical = 4.dp)
            .clickable { onClick() },
        shape = RoundedCornerShape(16.dp),
        colors = CardDefaults.cardColors(containerColor = Color.White),
        elevation = CardDefaults.cardElevation(defaultElevation = 2.dp)
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 12.dp, vertical = 10.dp)
        ) {
            // Linha superior: Tipo com Badge Colorida e Status
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    modifier = Modifier
                        .clip(RoundedCornerShape(7.dp))
                        .background(if (isPreventive) Color(0xFFE0F2FE) else Color(0xFFF3E8FF))
                        .padding(horizontal = 7.dp, vertical = 3.dp)
                ) {
                    Icon(
                        imageVector = if (isPreventive) Icons.Default.Shield else Icons.Default.Build,
                        contentDescription = null,
                        tint = if (isPreventive) Color(0xFF0284C7) else Color(0xFF7E22CE),
                        modifier = Modifier.size(12.dp)
                    )
                    Spacer(modifier = Modifier.width(4.dp))
                    Text(
                        text = if (isPreventive) "MANUTENÇÃO PREVENTIVA" else "ORDEM DE SERVIÇO",
                        fontWeight = FontWeight.Black,
                        fontSize = 9.sp,
                        color = if (isPreventive) Color(0xFF0369A1) else Color(0xFF6B21A8)
                    )
                }

                Box(
                    modifier = Modifier
                        .clip(RoundedCornerShape(7.dp))
                        .background(statusBg)
                        .padding(horizontal = 7.dp, vertical = 3.dp)
                ) {
                    Text(
                        text = statusLabel.uppercase(),
                        fontWeight = FontWeight.Black,
                        fontSize = 9.sp,
                        color = statusText
                    )
                }
            }

            Spacer(modifier = Modifier.height(6.dp))

            // Parada na Rota e Identificação
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                if (stopIndex != null) {
                    Text(
                        text = "📍 ${stopIndex}ª PARADA DA ROTA",
                        fontWeight = FontWeight.Black,
                        fontSize = 10.sp,
                        color = Color(0xFF64748B),
                        letterSpacing = 0.4.sp
                    )
                }
                Text(
                    text = "ID: ${order.osNumber}",
                    fontSize = 10.sp,
                    fontWeight = FontWeight.Bold,
                    color = Color(0xFF94A3B8)
                )
            }

            Spacer(modifier = Modifier.height(3.dp))

            // Nome do Cliente em destaque
            Text(
                text = order.clientName,
                fontWeight = FontWeight.Black,
                fontSize = 14.sp,
                color = TextPrimary,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis
            )

            Spacer(modifier = Modifier.height(2.dp))

            // Endereço do Local
            Row(
                verticalAlignment = Alignment.Top,
                modifier = Modifier.fillMaxWidth()
            ) {
                Icon(
                    imageVector = Icons.Default.LocationOn,
                    contentDescription = null,
                    tint = BluePrimary,
                    modifier = Modifier
                        .size(13.dp)
                        .padding(top = 2.dp)
                )
                Spacer(modifier = Modifier.width(4.dp))
                Text(
                    text = "${order.addressStreet}${order.addressNumber?.let { ", $it" } ?: ""}${order.addressCity?.let { " - $it" } ?: ""}",
                    fontSize = 11.sp,
                    color = TextSecondary,
                    fontWeight = FontWeight.Medium,
                    lineHeight = 14.sp,
                    maxLines = 2,
                    overflow = TextOverflow.Ellipsis
                )
            }

            // Área compacta de acompanhamento de máquinas do endereço
            Spacer(modifier = Modifier.height(7.dp))
            val actualTotal = if (totalMachines > 0) totalMachines else 1
            val progressFraction = if (totalMachines > 0) {
                (completedMachines.toFloat() / totalMachines.toFloat()).coerceIn(0f, 1f)
            } else {
                0f
            }
            val percentageInt = (progressFraction * 100).toInt()

            val (barColor, barBg, statusTag) = when {
                totalMachines > 0 && completedMachines >= totalMachines -> Triple(
                    Color(0xFF059669),
                    Color(0xFFDCFCE7),
                    "CONCLUÍDO ✓"
                )
                completedMachines > 0 -> Triple(
                    Color(0xFFD97706),
                    Color(0xFFFEF3C7),
                    "EM ANDAMENTO"
                )
                else -> Triple(
                    BluePrimary,
                    Color(0xFFEFF6FF),
                    "A INICIAR"
                )
            }

            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .clip(RoundedCornerShape(9.dp))
                    .background(barBg)
                    .border(1.dp, barColor.copy(alpha = 0.22f), RoundedCornerShape(9.dp))
                    .padding(horizontal = 9.dp, vertical = 6.dp)
            ) {
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Icon(
                            imageVector = if (completedMachines >= actualTotal && totalMachines > 0) Icons.Default.CheckCircle else Icons.Default.Build,
                            contentDescription = null,
                            tint = barColor,
                            modifier = Modifier.size(12.dp)
                        )
                        Spacer(modifier = Modifier.width(5.dp))
                        Text(
                            text = if (totalMachines > 0) {
                                "$completedMachines/$totalMachines máquinas"
                            } else {
                                "Toque para carregar máquinas"
                            },
                            fontSize = 11.sp,
                            fontWeight = FontWeight.Black,
                            color = if (totalMachines > 0) barColor else Color(0xFF64748B)
                        )
                    }

                    Row(
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(6.dp)
                    ) {
                        if (totalMachines > 0) {
                            Text(
                                text = "$percentageInt%",
                                fontSize = 11.sp,
                                fontWeight = FontWeight.Black,
                                color = barColor
                            )
                        }
                        Box(
                            modifier = Modifier
                                .clip(RoundedCornerShape(5.dp))
                                .background(barColor.copy(alpha = 0.14f))
                                .padding(horizontal = 5.dp, vertical = 1.dp)
                        ) {
                            Text(
                                text = statusTag,
                                fontSize = 8.sp,
                                fontWeight = FontWeight.Black,
                                color = barColor
                            )
                        }
                    }
                }

                Spacer(modifier = Modifier.height(4.dp))

                LinearProgressIndicator(
                    progress = { progressFraction },
                    modifier = Modifier
                        .fillMaxWidth()
                        .height(5.dp)
                        .clip(RoundedCornerShape(3.dp)),
                    color = barColor,
                    trackColor = Color.White.copy(alpha = 0.85f)
                )
            }

            Spacer(modifier = Modifier.height(7.dp))

            Divider(color = Color(0xFFF1F5F9), thickness = 1.dp)

            Spacer(modifier = Modifier.height(7.dp))

            // Rodapé: Ação do Técnico
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Column(modifier = Modifier.weight(1f)) {
                    val (footerIcon, footerTint, footerLabel) = when {
                        order.status == "finalizada" && order.isSyncedWithServer -> Triple(
                            Icons.Default.CloudDone,
                            Color(0xFF059669),
                            "Concluído • Enviado"
                        )
                        order.status == "finalizada" && !order.isSyncedWithServer -> Triple(
                            Icons.Default.CloudUpload,
                            Color(0xFFD97706),
                            "Salvo no aparelho • Aguardando envio"
                        )
                        order.status == "em_andamento" && !order.isSyncedWithServer -> Triple(
                            Icons.Default.CloudUpload,
                            Color(0xFFD97706),
                            "Em andamento • Salvo no aparelho"
                        )
                        else -> {
                            val todayIso = java.text.SimpleDateFormat("yyyy-MM-dd", java.util.Locale.getDefault()).format(java.util.Date())
                            val plannedIso = (order.plannedDate ?: "").trim().take(10)
                            val plannedLabel = if (plannedIso.isBlank() || plannedIso == todayIso) {
                                "Programado para Hoje"
                            } else {
                                "Programado para ${com.lefrio.atendimento.util.DateTimeUtils.formatDisplayDate(plannedIso)}"
                            }
                            Triple(
                                Icons.Default.Schedule,
                                Color(0xFF64748B),
                                plannedLabel
                            )
                        }
                    }
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Icon(
                            imageVector = footerIcon,
                            contentDescription = null,
                            tint = footerTint,
                            modifier = Modifier.size(13.dp)
                        )
                        Spacer(modifier = Modifier.width(4.dp))
                        Text(
                            text = footerLabel,
                            fontSize = 10.sp,
                            fontWeight = FontWeight.SemiBold,
                            color = footerTint,
                            maxLines = 1,
                            overflow = TextOverflow.Ellipsis
                        )
                    }
                    if (order.status == "finalizada") {
                        val compTime = com.lefrio.atendimento.util.DateTimeUtils.formatDisplayTime(order.completionDate)
                        val sigTime = com.lefrio.atendimento.util.DateTimeUtils.formatDisplayTime(order.clientSignatureDate)
                        if (compTime.isNotBlank() || sigTime.isNotBlank()) {
                            Spacer(modifier = Modifier.height(2.dp))
                            Row(
                                verticalAlignment = Alignment.CenterVertically,
                                horizontalArrangement = Arrangement.spacedBy(6.dp)
                            ) {
                                if (compTime.isNotBlank()) {
                                    Text(
                                        text = "🕒 Fin: $compTime",
                                        fontSize = 9.sp,
                                        fontWeight = FontWeight.Bold,
                                        color = Color(0xFF4338CA)
                                    )
                                }
                                if (sigTime.isNotBlank()) {
                                    Text(
                                        text = "✍️ Ass: $sigTime",
                                        fontSize = 9.sp,
                                        fontWeight = FontWeight.Bold,
                                        color = Color(0xFF047857)
                                    )
                                }
                            }
                        }
                    }
                }

                Spacer(modifier = Modifier.width(8.dp))

                Button(
                    onClick = onClick,
                    shape = RoundedCornerShape(9.dp),
                    colors = ButtonDefaults.buttonColors(
                        containerColor = when (order.status) {
                            "finalizada" -> Color(0xFFF1F5F9)
                            "em_andamento" -> Color(0xFFF59E0B)
                            else -> BluePrimary
                        },
                        contentColor = when (order.status) {
                            "finalizada" -> TextPrimary
                            else -> Color.White
                        }
                    ),
                    contentPadding = PaddingValues(horizontal = 10.dp, vertical = 4.dp),
                    modifier = Modifier.height(30.dp)
                ) {
                    Text(
                        text = when (order.status) {
                            "aberta" -> "INICIAR ATENDIMENTO"
                            "em_andamento" -> "CONTINUAR CHECKLIST"
                            else -> "VER RESUMO"
                        },
                        fontSize = 9.sp,
                        fontWeight = FontWeight.Black
                    )
                    Spacer(modifier = Modifier.width(3.dp))
                    Icon(
                        imageVector = Icons.Default.ChevronRight,
                        contentDescription = null,
                        modifier = Modifier.size(13.dp)
                    )
                }
            }
        }
    }
}
