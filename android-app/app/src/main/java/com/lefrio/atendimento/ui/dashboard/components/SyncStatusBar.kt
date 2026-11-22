package com.lefrio.atendimento.ui.dashboard.components

import androidx.compose.animation.core.LinearEasing
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.CloudDone
import androidx.compose.material.icons.filled.CloudOff
import androidx.compose.material.icons.filled.Sync
import androidx.compose.material.icons.filled.Warning
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.rotate
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp

@Composable
fun SyncStatusBar(
    isOnline: Boolean,
    pendingTasksCount: Int,
    quarantinedTasksCount: Int = 0,
    isSyncing: Boolean = false,
    onForceSyncClick: () -> Unit
) {
    val infiniteTransition = rememberInfiniteTransition(label = "statusBarSyncRotation")
    val rotationAngle by infiniteTransition.animateFloat(
        initialValue = 0f,
        targetValue = 360f,
        animationSpec = infiniteRepeatable(
            animation = tween(900, easing = LinearEasing),
            repeatMode = RepeatMode.Restart
        ),
        label = "rotation"
    )

    val totalSavedLocal = pendingTasksCount + quarantinedTasksCount

    val bgColor = when {
        !isOnline -> Color(0xFFFEF3C7) // Âmbar / Offline
        isSyncing -> Color(0xFFE0F2FE) // Sky Blue / Varredura Ativa
        quarantinedTasksCount > 0 -> Color(0xFFFEE2E2) // Vermelho suave / Falha persistente
        pendingTasksCount > 0 -> Color(0xFFDBEAFE) // Azul / Enviando em segundo plano
        else -> Color(0xFFD1FAE5) // Verde / Sincronizado
    }

    val textColor = when {
        !isOnline -> Color(0xFF92400E)
        isSyncing -> Color(0xFF0369A1)
        quarantinedTasksCount > 0 -> Color(0xFFB91C1C)
        pendingTasksCount > 0 -> Color(0xFF1E40AF)
        else -> Color(0xFF065F46)
    }

    val icon = when {
        !isOnline -> Icons.Default.CloudOff
        isSyncing -> Icons.Default.Sync
        quarantinedTasksCount > 0 -> Icons.Default.Warning
        pendingTasksCount > 0 -> Icons.Default.Sync
        else -> Icons.Default.CloudDone
    }

    val message = when {
        !isOnline && totalSavedLocal > 0 -> "Offline • $totalSavedLocal dado(s) salvo(s) com segurança no aparelho"
        !isOnline -> "Modo Offline • Dados gravados com segurança no aparelho"
        isSyncing -> "Sincronizando pendências e roteiro com o servidor..."
        quarantinedTasksCount > 0 -> "$quarantinedTasksCount envio(s) com falha persistente • Toque para reenviar"
        pendingTasksCount > 0 -> "$pendingTasksCount pendência(s) na fila • Enviando em segundo plano"
        else -> "Online • Dados sincronizados • Toque para atualizar roteiro"
    }

    Box(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = 16.dp, vertical = 6.dp)
            .clip(RoundedCornerShape(10.dp))
            .background(bgColor)
            .clickable(enabled = !isSyncing) { onForceSyncClick() }
            .padding(horizontal = 12.dp, vertical = 8.dp)
    ) {
        Row(
            modifier = Modifier.fillMaxWidth(),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.SpaceBetween
        ) {
            Row(
                verticalAlignment = Alignment.CenterVertically,
                modifier = Modifier.weight(1f)
            ) {
                Icon(
                    imageVector = icon,
                    contentDescription = null,
                    tint = textColor,
                    modifier = Modifier
                        .size(16.dp)
                        .then(if (isSyncing) Modifier.rotate(rotationAngle) else Modifier)
                )
                Spacer(modifier = Modifier.width(8.dp))
                Text(
                    text = message,
                    color = textColor,
                    fontSize = 11.sp,
                    fontWeight = FontWeight.Bold
                )
            }

            if (isOnline && !isSyncing) {
                Text(
                    text = when {
                        quarantinedTasksCount > 0 -> "REENVIAR"
                        pendingTasksCount > 0 -> "ENVIAR AGORA"
                        else -> "ATUALIZAR"
                    },
                    color = textColor,
                    fontSize = 9.sp,
                    fontWeight = FontWeight.Black,
                    modifier = Modifier.padding(start = 6.dp)
                )
            } else if (!isOnline && totalSavedLocal > 0) {
                Text(
                    text = "SEGURO LOCAL",
                    color = textColor,
                    fontSize = 9.sp,
                    fontWeight = FontWeight.Black,
                    modifier = Modifier.padding(start = 6.dp)
                )
            }
        }
    }
}
