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

    val bgColor = when {
        !isOnline -> Color(0xFFFEF3C7) // Âmbar / Offline
        isSyncing -> Color(0xFFE0F2FE) // Sky Blue / Varredura Ativa
        pendingTasksCount > 0 -> Color(0xFFDBEAFE) // Azul / Sincronizando
        else -> Color(0xFFD1FAE5) // Verde / Sincronizado
    }

    val textColor = when {
        !isOnline -> Color(0xFF92400E)
        isSyncing -> Color(0xFF0369A1)
        pendingTasksCount > 0 -> Color(0xFF1E40AF)
        else -> Color(0xFF065F46)
    }

    val icon = when {
        !isOnline -> Icons.Default.CloudOff
        isSyncing || pendingTasksCount > 0 -> Icons.Default.Sync
        else -> Icons.Default.CloudDone
    }

    val message = when {
        !isOnline -> "Modo Offline ativo • Dados gravados no aparelho"
        isSyncing -> "Fazendo varredura no servidor para buscar seu roteiro do dia..."
        pendingTasksCount > 0 -> "$pendingTasksCount alteração(ões) salva(s) localmente • Sincronizando..."
        else -> "Online • Dados 100% sincronizados com o servidor"
    }

    Box(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = 16.dp, vertical = 6.dp)
            .clip(RoundedCornerShape(10.dp))
            .background(bgColor)
            .clickable(enabled = isOnline && !isSyncing) { onForceSyncClick() }
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
                    text = if (pendingTasksCount > 0) "SINCRONIZAR AGORA" else "VARREDURA",
                    color = textColor,
                    fontSize = 9.sp,
                    fontWeight = FontWeight.Black,
                    modifier = Modifier.padding(start = 6.dp)
                )
            }
        }
    }
}
