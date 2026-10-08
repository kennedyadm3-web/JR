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
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.lefrio.atendimento.data.local.entity.ServiceOrderEntity
import com.lefrio.atendimento.ui.theme.*

@Composable
fun ServiceOrderCard(
    order: ServiceOrderEntity,
    stopIndex: Int? = null,
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
            .padding(horizontal = 16.dp, vertical = 6.dp)
            .clickable { onClick() },
        shape = RoundedCornerShape(20.dp),
        colors = CardDefaults.cardColors(containerColor = Color.White),
        elevation = CardDefaults.cardElevation(defaultElevation = 2.dp)
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(16.dp)
        ) {
            // Linha superior: Tipo com Badge Colorida e Status
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                // Badge do Tipo do Atendimento
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    modifier = Modifier
                        .clip(RoundedCornerShape(8.dp))
                        .background(if (isPreventive) Color(0xFFE0F2FE) else Color(0xFFF3E8FF))
                        .padding(horizontal = 8.dp, vertical = 4.dp)
                ) {
                    Icon(
                        imageVector = if (isPreventive) Icons.Default.Shield else Icons.Default.Build,
                        contentDescription = null,
                        tint = if (isPreventive) Color(0xFF0284C7) else Color(0xFF7E22CE),
                        modifier = Modifier.size(13.dp)
                    )
                    Spacer(modifier = Modifier.width(5.dp))
                    Text(
                        text = if (isPreventive) "MANUTENÇÃO PREVENTIVA" else "ORDEM DE SERVIÇO",
                        fontWeight = FontWeight.Black,
                        fontSize = 10.sp,
                        color = if (isPreventive) Color(0xFF0369A1) else Color(0xFF6B21A8)
                    )
                }

                // Badge de Status do Atendimento
                Box(
                    modifier = Modifier
                        .clip(RoundedCornerShape(8.dp))
                        .background(statusBg)
                        .padding(horizontal = 8.dp, vertical = 4.dp)
                ) {
                    Text(
                        text = statusLabel.uppercase(),
                        fontWeight = FontWeight.Black,
                        fontSize = 9.sp,
                        color = statusText
                    )
                }
            }

            Spacer(modifier = Modifier.height(10.dp))

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
                        fontSize = 11.sp,
                        color = Color(0xFF64748B),
                        letterSpacing = 0.5.sp
                    )
                }
                Text(
                    text = "Identificador: ${order.osNumber}",
                    fontSize = 11.sp,
                    fontWeight = FontWeight.Bold,
                    color = Color(0xFF94A3B8)
                )
            }

            Spacer(modifier = Modifier.height(6.dp))

            // Nome do Cliente em grande destaque
            Text(
                text = order.clientName,
                fontWeight = FontWeight.Black,
                fontSize = 15.sp,
                color = TextPrimary
            )

            Spacer(modifier = Modifier.height(6.dp))

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
                        .size(15.dp)
                        .padding(top = 2.dp)
                )
                Spacer(modifier = Modifier.width(6.dp))
                Text(
                    text = "${order.addressStreet}${order.addressNumber?.let { ", $it" } ?: ""}${order.addressCity?.let { " - $it" } ?: ""}",
                    fontSize = 12.sp,
                    color = TextSecondary,
                    fontWeight = FontWeight.Medium,
                    lineHeight = 16.sp
                )
            }

            // Descrição / Observação do Atendimento
            order.generalNotes?.let { notes ->
                if (notes.isNotBlank()) {
                    Spacer(modifier = Modifier.height(8.dp))
                    Box(
                        modifier = Modifier
                            .fillMaxWidth()
                            .clip(RoundedCornerShape(10.dp))
                            .background(Color(0xFFF8FAFC))
                            .border(1.dp, Color(0xFFE2E8F0), RoundedCornerShape(10.dp))
                            .padding(8.dp)
                    ) {
                        Text(
                            text = notes,
                            fontSize = 11.sp,
                            color = Color(0xFF475569),
                            lineHeight = 15.sp
                        )
                    }
                }
            }

            Spacer(modifier = Modifier.height(12.dp))

            Divider(color = Color(0xFFF1F5F9), thickness = 1.dp)

            Spacer(modifier = Modifier.height(10.dp))

            // Rodapé: Ação do Técnico
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Icon(
                        imageVector = if (order.status == "finalizada") Icons.Default.CheckCircle else Icons.Default.Schedule,
                        contentDescription = null,
                        tint = if (order.status == "finalizada") Color(0xFF059669) else Color(0xFF64748B),
                        modifier = Modifier.size(14.dp)
                    )
                    Spacer(modifier = Modifier.width(5.dp))
                    Text(
                        text = if (order.status == "finalizada") "Concluído com Assinatura" else "Programado para Hoje",
                        fontSize = 11.sp,
                        fontWeight = FontWeight.SemiBold,
                        color = if (order.status == "finalizada") Color(0xFF059669) else Color(0xFF64748B)
                    )
                }

                Button(
                    onClick = onClick,
                    shape = RoundedCornerShape(10.dp),
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
                    contentPadding = PaddingValues(horizontal = 12.dp, vertical = 6.dp),
                    modifier = Modifier.height(34.dp)
                ) {
                    Text(
                        text = when (order.status) {
                            "aberta" -> "INICIAR ATENDIMENTO"
                            "em_andamento" -> "CONTINUAR CHECKLIST"
                            else -> "VER RESUMO"
                        },
                        fontSize = 10.sp,
                        fontWeight = FontWeight.Black
                    )
                    Spacer(modifier = Modifier.width(4.dp))
                    Icon(
                        imageVector = Icons.Default.ChevronRight,
                        contentDescription = null,
                        modifier = Modifier.size(14.dp)
                    )
                }
            }
        }
    }
}
