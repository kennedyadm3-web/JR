package com.lefrio.atendimento.ui.components

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.filled.Download
import androidx.compose.material.icons.filled.ErrorOutline
import androidx.compose.material.icons.filled.Info
import androidx.compose.material.icons.filled.InstallMobile
import androidx.compose.material.icons.filled.SystemUpdate
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import com.lefrio.atendimento.ui.theme.BluePrimary
import com.lefrio.atendimento.ui.theme.TextPrimary
import com.lefrio.atendimento.ui.theme.TextSecondary
import com.lefrio.atendimento.util.AppUpdateInfo
import java.util.Locale

enum class UpdateState {
    IDLE,
    DOWNLOADING,
    READY_TO_INSTALL,
    ERROR
}

@Composable
fun UpdateDialog(
    updateInfo: AppUpdateInfo,
    currentVersionName: String,
    canInstallPackages: Boolean = true,
    onStartDownload: (
        onProgress: (progress: Float, downloadedBytes: Long, totalBytes: Long) -> Unit,
        onCompleted: () -> Unit,
        onError: (message: String) -> Unit
    ) -> Unit,
    onCancelDownload: () -> Unit = {},
    onInstallNowClick: () -> Unit,
    onDismissRequest: () -> Unit
) {
    var state by remember(updateInfo.latestVersionCode) {
        mutableStateOf(
            if (updateInfo.isAlreadyDownloaded) UpdateState.READY_TO_INSTALL else UpdateState.IDLE
        )
    }
    var downloadProgress by remember { mutableFloatStateOf(0f) }
    var isIndeterminate by remember { mutableStateOf(false) }
    var downloadDetailsText by remember { mutableStateOf("Conectando ao servidor...") }
    var errorMessage by remember { mutableStateOf<String?>(null) }

    fun beginDownload() {
        state = UpdateState.DOWNLOADING
        errorMessage = null
        downloadProgress = 0f
        isIndeterminate = true
        downloadDetailsText = "Conectando ao servidor..."
        onStartDownload(
            { progress, downloaded, total ->
                val mbDown = String.format(Locale.US, "%.1f", downloaded / (1024f * 1024f))
                if (progress < 0f || total <= 0L) {
                    isIndeterminate = true
                    downloadDetailsText = "Baixando... $mbDown MB"
                } else {
                    isIndeterminate = false
                    downloadProgress = progress.coerceIn(0f, 1f)
                    val mbTot = String.format(Locale.US, "%.1f", total / (1024f * 1024f))
                    val pct = (downloadProgress * 100).toInt()
                    downloadDetailsText = "$mbDown MB / $mbTot MB ($pct%)"
                }
            },
            {
                isIndeterminate = false
                downloadProgress = 1f
                state = UpdateState.READY_TO_INSTALL
            },
            { err ->
                state = UpdateState.ERROR
                errorMessage = err
            }
        )
    }

    Dialog(
        onDismissRequest = {
            if (!updateInfo.isMandatory && state != UpdateState.DOWNLOADING) {
                onDismissRequest()
            }
        },
        properties = DialogProperties(
            dismissOnBackPress = !updateInfo.isMandatory && state != UpdateState.DOWNLOADING,
            dismissOnClickOutside = !updateInfo.isMandatory && state != UpdateState.DOWNLOADING
        )
    ) {
        Card(
            modifier = Modifier
                .fillMaxWidth()
                .padding(12.dp),
            shape = RoundedCornerShape(24.dp),
            colors = CardDefaults.cardColors(containerColor = Color.White),
            elevation = CardDefaults.cardElevation(defaultElevation = 8.dp)
        ) {
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(22.dp),
                horizontalAlignment = Alignment.CenterHorizontally
            ) {
                // Ícone do topo
                Box(
                    modifier = Modifier
                        .size(56.dp)
                        .clip(RoundedCornerShape(16.dp))
                        .background(
                            when (state) {
                                UpdateState.READY_TO_INSTALL -> Color(0xFFD1FAE5)
                                UpdateState.ERROR -> Color(0xFFFEE2E2)
                                else -> BluePrimary.copy(alpha = 0.12f)
                            }
                        ),
                    contentAlignment = Alignment.Center
                ) {
                    Icon(
                        imageVector = when (state) {
                            UpdateState.READY_TO_INSTALL -> Icons.Default.CheckCircle
                            UpdateState.ERROR -> Icons.Default.ErrorOutline
                            UpdateState.DOWNLOADING -> Icons.Default.Download
                            else -> Icons.Default.SystemUpdate
                        },
                        contentDescription = null,
                        tint = when (state) {
                            UpdateState.READY_TO_INSTALL -> Color(0xFF059669)
                            UpdateState.ERROR -> Color(0xFFDC2626)
                            else -> BluePrimary
                        },
                        modifier = Modifier.size(28.dp)
                    )
                }

                Spacer(modifier = Modifier.height(14.dp))

                Text(
                    text = when (state) {
                        UpdateState.READY_TO_INSTALL -> "Pronto para Instalar!"
                        UpdateState.DOWNLOADING -> "Baixando Atualização..."
                        UpdateState.ERROR -> "Falha na Atualização"
                        else -> "Nova Versão Disponível!"
                    },
                    fontWeight = FontWeight.Black,
                    fontSize = 18.sp,
                    color = TextPrimary,
                    textAlign = TextAlign.Center
                )

                Spacer(modifier = Modifier.height(6.dp))

                // Badge comparativo de versões (vAtual -> vNova)
                Surface(
                    shape = RoundedCornerShape(8.dp),
                    color = Color(0xFFEFF6FF)
                ) {
                    Text(
                        text = "v$currentVersionName  →  v${updateInfo.latestVersionName}",
                        fontSize = 11.sp,
                        fontWeight = FontWeight.Black,
                        color = BluePrimary,
                        modifier = Modifier.padding(horizontal = 10.dp, vertical = 4.dp)
                    )
                }

                Spacer(modifier = Modifier.height(8.dp))

                Text(
                    text = when (state) {
                        UpdateState.READY_TO_INSTALL -> "Arquivo verificado com segurança. Toque abaixo para concluir a atualização sem perder nenhum atendimento salvo."
                        UpdateState.DOWNLOADING -> "Aguarde alguns segundos enquanto o aplicativo prepara a nova versão."
                        UpdateState.ERROR -> errorMessage ?: "Não foi possível baixar a atualização."
                        else -> "Atualize direto pelo aplicativo com 1 toque. Seus atendimentos salvos no aparelho não serão perdidos."
                    },
                    fontSize = 12.sp,
                    color = if (state == UpdateState.ERROR) Color(0xFFDC2626) else TextSecondary,
                    textAlign = TextAlign.Center,
                    lineHeight = 16.sp
                )

                Spacer(modifier = Modifier.height(14.dp))

                // Notas da Versão (exibidas quando IDLE ou READY)
                if (state != UpdateState.DOWNLOADING) {
                    Box(
                        modifier = Modifier
                            .fillMaxWidth()
                            .clip(RoundedCornerShape(12.dp))
                            .background(Color(0xFFF1F5F9))
                            .padding(12.dp)
                    ) {
                        Column {
                            Text(
                                text = "Novidades da v${updateInfo.latestVersionName}:",
                                fontWeight = FontWeight.Bold,
                                fontSize = 11.sp,
                                color = TextPrimary
                            )
                            Spacer(modifier = Modifier.height(4.dp))
                            Text(
                                text = updateInfo.releaseNotes.ifBlank { "Melhorias de desempenho e estabilidade do sistema." },
                                fontSize = 11.sp,
                                color = TextSecondary,
                                lineHeight = 16.sp
                            )
                        }
                    }
                    Spacer(modifier = Modifier.height(12.dp))
                }

                // Orientação rápida apenas se o aparelho ainda não liberou "Instalar apps desconhecidos"
                if (!canInstallPackages && state != UpdateState.DOWNLOADING && state != UpdateState.ERROR) {
                    Surface(
                        modifier = Modifier.fillMaxWidth(),
                        shape = RoundedCornerShape(10.dp),
                        color = Color(0xFFFFFBEB),
                        border = BorderStroke(1.dp, Color(0xFFFDE68A))
                    ) {
                        Row(
                            modifier = Modifier.padding(horizontal = 10.dp, vertical = 8.dp),
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            Icon(
                                imageVector = Icons.Default.Info,
                                contentDescription = null,
                                tint = Color(0xFFB45309),
                                modifier = Modifier.size(16.dp)
                            )
                            Spacer(modifier = Modifier.width(8.dp))
                            Text(
                                text = "Na 1ª atualização, ative 'Permitir desta fonte' e volte — a instalação continuará sozinha.",
                                fontSize = 10.sp,
                                color = Color(0xFF92400E),
                                lineHeight = 14.sp,
                                fontWeight = FontWeight.Medium
                            )
                        }
                    }
                    Spacer(modifier = Modifier.height(12.dp))
                }

                when (state) {
                    UpdateState.DOWNLOADING -> {
                        Column(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalAlignment = Alignment.CenterHorizontally
                        ) {
                            if (isIndeterminate) {
                                LinearProgressIndicator(
                                    modifier = Modifier
                                        .fillMaxWidth()
                                        .height(8.dp)
                                        .clip(RoundedCornerShape(4.dp)),
                                    color = BluePrimary,
                                    trackColor = Color(0xFFE2E8F0)
                                )
                            } else {
                                LinearProgressIndicator(
                                    progress = downloadProgress,
                                    modifier = Modifier
                                        .fillMaxWidth()
                                        .height(8.dp)
                                        .clip(RoundedCornerShape(4.dp)),
                                    color = BluePrimary,
                                    trackColor = Color(0xFFE2E8F0)
                                )
                            }

                            Spacer(modifier = Modifier.height(10.dp))

                            Text(
                                text = downloadDetailsText,
                                fontSize = 11.sp,
                                color = TextSecondary,
                                fontWeight = FontWeight.Bold,
                                textAlign = TextAlign.Center
                            )

                            Spacer(modifier = Modifier.height(6.dp))

                            Text(
                                text = "O instalador abrirá automaticamente ao concluir.",
                                fontSize = 10.sp,
                                color = Color(0xFF94A3B8),
                                textAlign = TextAlign.Center
                            )

                            if (!updateInfo.isMandatory) {
                                Spacer(modifier = Modifier.height(10.dp))
                                TextButton(
                                    onClick = {
                                        onCancelDownload()
                                        state = UpdateState.IDLE
                                    }
                                ) {
                                    Text(
                                        text = "Cancelar download",
                                        color = TextSecondary,
                                        fontSize = 11.sp,
                                        fontWeight = FontWeight.Bold
                                    )
                                }
                            }
                        }
                    }

                    UpdateState.READY_TO_INSTALL -> {
                        Column(modifier = Modifier.fillMaxWidth()) {
                            Button(
                                onClick = onInstallNowClick,
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .height(48.dp),
                                shape = RoundedCornerShape(12.dp),
                                colors = ButtonDefaults.buttonColors(containerColor = Color(0xFF059669))
                            ) {
                                Icon(
                                    imageVector = Icons.Default.InstallMobile,
                                    contentDescription = null,
                                    modifier = Modifier.size(18.dp)
                                )
                                Spacer(modifier = Modifier.width(8.dp))
                                Text(
                                    text = "INSTALAR ATUALIZAÇÃO AGORA",
                                    fontWeight = FontWeight.Black,
                                    fontSize = 12.sp
                                )
                            }

                            if (!updateInfo.isMandatory) {
                                Spacer(modifier = Modifier.height(6.dp))
                                TextButton(
                                    onClick = onDismissRequest,
                                    modifier = Modifier.fillMaxWidth()
                                ) {
                                    Text(
                                        text = "Instalar depois",
                                        color = TextSecondary,
                                        fontSize = 11.sp,
                                        fontWeight = FontWeight.Bold
                                    )
                                }
                            }
                        }
                    }

                    UpdateState.ERROR -> {
                        Column(modifier = Modifier.fillMaxWidth()) {
                            Button(
                                onClick = { beginDownload() },
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .height(46.dp),
                                shape = RoundedCornerShape(12.dp),
                                colors = ButtonDefaults.buttonColors(containerColor = BluePrimary)
                            ) {
                                Text(
                                    text = "TENTAR NOVAMENTE",
                                    fontWeight = FontWeight.Black,
                                    fontSize = 12.sp
                                )
                            }

                            if (!updateInfo.isMandatory) {
                                Spacer(modifier = Modifier.height(6.dp))
                                TextButton(
                                    onClick = onDismissRequest,
                                    modifier = Modifier.fillMaxWidth()
                                ) {
                                    Text(
                                        text = "Fechar",
                                        color = TextSecondary,
                                        fontSize = 11.sp,
                                        fontWeight = FontWeight.Bold
                                    )
                                }
                            }
                        }
                    }

                    UpdateState.IDLE -> {
                        Column(modifier = Modifier.fillMaxWidth()) {
                            Button(
                                onClick = { beginDownload() },
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .height(48.dp),
                                shape = RoundedCornerShape(12.dp),
                                colors = ButtonDefaults.buttonColors(containerColor = BluePrimary)
                            ) {
                                Icon(
                                    imageVector = Icons.Default.Download,
                                    contentDescription = null,
                                    modifier = Modifier.size(18.dp)
                                )
                                Spacer(modifier = Modifier.width(8.dp))
                                Text(
                                    text = "BAIXAR E ATUALIZAR AGORA",
                                    fontWeight = FontWeight.Black,
                                    fontSize = 12.sp,
                                    letterSpacing = 0.4.sp
                                )
                            }

                            if (!updateInfo.isMandatory) {
                                Spacer(modifier = Modifier.height(6.dp))
                                TextButton(
                                    onClick = onDismissRequest,
                                    modifier = Modifier.fillMaxWidth()
                                ) {
                                    Text(
                                        text = "Lembrar mais tarde",
                                        color = TextSecondary,
                                        fontSize = 11.sp,
                                        fontWeight = FontWeight.Bold
                                    )
                                }
                            }
                        }
                    }
                }
            }
        }
    }
}
