package com.lefrio.atendimento.ui.dashboard.components

import androidx.compose.animation.AnimatedVisibility
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
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp

@Composable
fun SyncStatusBar(
    isOnline: Boolean,
    pendingTasksCount: Int,
    onForceSyncClick: () -> Unit
) {
    val bgColor = when {
        !isOnline -> Color(0xFFFEF3C7) // Âmbar / Offline
        pendingTasksCount > 0 -> Color(0xFFDBEAFE) // Azul / Sincronizando
        else -> Color(0xFFD1FAE5) // Verde / Sincronizado
    }

    val textColor = when {
        !isOnline -> Color(0xFF92400E)
        pendingTasksCount > 0 -> Color(0xFF1E40AF)
        else -> Color(0xFF065F46)
    }

    val icon = when {
        !isOnline -> Icons.Default.CloudOff
        pendingTasksCount > 0 -> Icons.Default.Sync
        else -> Icons.Default.CloudDone
    }

    val message = when {
        !isOnline -> "Modo Offline ativo • Dados gravados no aparelho"
        pendingTasksCount > 0 -> "$pendingTasksCount alteração(ões) salva(s) localmente • Sincronizando..."
        else -> "Online • Dados 100% sincronizados com o servidor"
    }

    Box(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = 16.dp, vertical = 6.dp)
            .clip(RoundedCornerShape(10.dp))
            .background(bgColor)
            .clickable(enabled = isOnline && pendingTasksCount > 0) { onForceSyncClick() }
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
                    modifier = Modifier.size(16.dp)
                )
                Spacer(modifier = Modifier.width(8.dp))
                Text(
                    text = message,
                    color = textColor,
                    fontSize = 11.sp,
                    fontWeight = FontWeight.Bold
                )
            }

            if (pendingTasksCount > 0 && isOnline) {
                Text(
                    text = "SINCRONIZAR AGORA",
                    color = textColor,
                    fontSize = 9.sp,
                    fontWeight = FontWeight.Black,
                    modifier = Modifier.padding(start = 6.dp)
                )
            }
        }
    }
}
