package com.lefrio.atendimento.ui.dashboard.components

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Build
import androidx.compose.material.icons.filled.ChevronRight
import androidx.compose.material.icons.filled.LocationOn
import androidx.compose.material.icons.filled.Schedule
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
    onClick: () -> Unit
) {
    val (statusLabel, statusBg, statusText) = when (order.status) {
        "aberta" -> Triple("Aberta", Color(0xFFEFF6FF), StatusOpen)
        "em_andamento" -> Triple("Em Andamento", Color(0xFFFEF3C7), StatusProgress)
        "finalizada" -> Triple("Finalizada", Color(0xFFD1FAE5), StatusCompleted)
        else -> Triple(order.status.uppercase(), Color(0xFFF1F5F9), TextSecondary)
    }

    Card(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = 16.dp, vertical = 6.dp)
            .clickable { onClick() },
        shape = RoundedCornerShape(16.dp),
        colors = CardDefaults.cardColors(containerColor = Color.White),
        elevation = CardDefaults.cardElevation(defaultElevation = 1.dp)
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(14.dp)
        ) {
            // Linha superior: O.S. e Status Badge
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text(
                        text = "O.S. #${order.osNumber}",
                        fontWeight = FontWeight.Black,
                        fontSize = 14.sp,
                        color = BluePrimary
                    )
                }

                Box(
                    modifier = Modifier
                        .clip(RoundedCornerShape(6.dp))
                        .background(statusBg)
                        .padding(horizontal = 8.dp, vertical = 3.dp)
                ) {
                    Text(
                        text = statusLabel.uppercase(),
                        fontWeight = FontWeight.Black,
                        fontSize = 9.sp,
                        color = statusText
                    )
                }
            }

            Spacer(modifier = Modifier.height(8.dp))

            // Nome do Cliente
            Text(
                text = order.clientName,
                fontWeight = FontWeight.Black,
                fontSize = 13.sp,
                color = TextPrimary
            )

            Spacer(modifier = Modifier.height(4.dp))

            // Endereço
            Row(verticalAlignment = Alignment.CenterVertically) {
                Icon(
                    imageVector = Icons.Default.LocationOn,
                    contentDescription = null,
                    tint = TextSecondary,
                    modifier = Modifier.size(13.dp)
                )
                Spacer(modifier = Modifier.width(4.dp))
                Text(
                    text = "${order.addressStreet}${order.addressNumber?.let { ", $it" } ?: ""}${order.addressCity?.let { " - $it" } ?: ""}",
                    fontSize = 11.sp,
                    color = TextSecondary,
                    fontWeight = FontWeight.Medium,
                    maxLines = 1
                )
            }

            Spacer(modifier = Modifier.height(10.dp))

            Divider(color = Color(0xFFF1F5F9), thickness = 1.dp)

            Spacer(modifier = Modifier.height(8.dp))

            // Rodapé: Tipo de Manutenção e Botão de Ação
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Icon(
                        imageVector = Icons.Default.Build,
                        contentDescription = null,
                        tint = TextSecondary,
                        modifier = Modifier.size(12.dp)
                    )
                    Spacer(modifier = Modifier.width(4.dp))
                    Text(
                        text = order.type,
                        fontSize = 10.sp,
                        fontWeight = FontWeight.Bold,
                        color = TextSecondary
                    )
                }

                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    modifier = Modifier.clickable { onClick() }
                ) {
                    Text(
                        text = when (order.status) {
                            "aberta" -> "INICIAR"
                            "em_andamento" -> "CONTINUAR"
                            else -> "VER DETALHES"
                        },
                        fontSize = 11.sp,
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
