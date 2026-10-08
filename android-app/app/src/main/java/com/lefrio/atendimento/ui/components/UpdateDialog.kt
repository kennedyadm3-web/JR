package com.lefrio.atendimento.ui.components

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.CheckCircle
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

enum class UpdateState {
    IDLE,
    DOWNLOADING,
    READY_TO_INSTALL
}

@Composable
fun UpdateDialog(
    updateInfo: AppUpdateInfo,
    onStartDownload: (onCompleted: () -> Unit) -> Unit,
    onInstallNowClick: () -> Unit,
    onDismissRequest: () -> Unit
) {
    var state by remember { mutableStateOf(UpdateState.IDLE) }

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
                .padding(16.dp),
            shape = RoundedCornerShape(20.dp),
            colors = CardDefaults.cardColors(containerColor = Color.White),
            elevation = CardDefaults.cardElevation(defaultElevation = 6.dp)
        ) {
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(24.dp),
                horizontalAlignment = Alignment.CenterHorizontally
            ) {
                // Ícone do topo
                Box(
                    modifier = Modifier
                        .size(54.dp)
                        .clip(RoundedCornerShape(14.dp))
                        .background(
                            if (state == UpdateState.READY_TO_INSTALL)
                                Color(0xFFD1FAE5)
                            else
                                BluePrimary.copy(alpha = 0.12f)
                        ),
                    contentAlignment = Alignment.Center
                ) {
                    Icon(
                        imageVector = if (state == UpdateState.READY_TO_INSTALL)
                            Icons.Default.CheckCircle
                        else
                            Icons.Default.SystemUpdate,
                        contentDescription = null,
                        tint = if (state == UpdateState.READY_TO_INSTALL) Color(0xFF059669) else BluePrimary,
                        modifier = Modifier.size(28.dp)
                    )
                }

                Spacer(modifier = Modifier.height(16.dp))

                Text(
                    text = if (state == UpdateState.READY_TO_INSTALL)
                        "Download Concluído!"
                    else
                        "Nova Versão Disponível!",
                    fontWeight = FontWeight.Black,
                    fontSize = 18.sp,
                    color = TextPrimary
                )

                Text(
                    text = if (state == UpdateState.READY_TO_INSTALL)
                        "O arquivo da versão ${updateInfo.latestVersionName} foi baixado com sucesso."
                    else
                        "Versão ${updateInfo.latestVersionName} disponível para instalação.",
                    fontSize = 12.sp,
                    color = TextSecondary,
                    textAlign = TextAlign.Center
                )

                Spacer(modifier = Modifier.height(14.dp))

                // Notas da Versão
                Box(
                    modifier = Modifier
                        .fillMaxWidth()
                        .clip(RoundedCornerShape(10.dp))
                        .background(Color(0xFFF1F5F9))
                        .padding(12.dp)
                ) {
                    Column {
                        Text(
                            text = "O que há de novo:",
                            fontWeight = FontWeight.Bold,
                            fontSize = 11.sp,
                            color = TextPrimary
                        )
                        Spacer(modifier = Modifier.height(4.dp))
                        Text(
                            text = updateInfo.releaseNotes,
                            fontSize = 11.sp,
                            color = TextSecondary,
                            lineHeight = 16.sp
                        )
                    }
                }

                Spacer(modifier = Modifier.height(20.dp))

                when (state) {
                    UpdateState.DOWNLOADING -> {
                        Column(horizontalAlignment = Alignment.CenterHorizontally) {
                            CircularProgressIndicator(
                                modifier = Modifier.size(28.dp),
                                color = BluePrimary,
                                strokeWidth = 2.5.dp
                            )
                            Spacer(modifier = Modifier.height(12.dp))
                            Text(
                                text = "Baixando atualização...\nO instalador abrirá assim que concluir.",
                                fontSize = 11.sp,
                                color = TextSecondary,
                                textAlign = TextAlign.Center,
                                lineHeight = 16.sp
                            )
                            Spacer(modifier = Modifier.height(12.dp))
                            TextButton(
                                onClick = {
                                    onInstallNowClick()
                                }
                            ) {
                                Text(
                                    text = "Já baixou? Clique para tentar instalar",
                                    fontSize = 11.sp,
                                    color = BluePrimary,
                                    fontWeight = FontWeight.Bold
                                )
                            }
                        }
                    }

                    UpdateState.READY_TO_INSTALL -> {
                        Column(horizontalAlignment = Alignment.CenterHorizontally) {
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
                                Spacer(modifier = Modifier.height(8.dp))
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
                        Button(
                            onClick = {
                                state = UpdateState.DOWNLOADING
                                onStartDownload {
                                    state = UpdateState.READY_TO_INSTALL
                                }
                            },
                            modifier = Modifier
                                .fillMaxWidth()
                                .height(46.dp),
                            shape = RoundedCornerShape(12.dp),
                            colors = ButtonDefaults.buttonColors(containerColor = BluePrimary)
                        ) {
                            Text(
                                text = "ATUALIZAR AGORA",
                                fontWeight = FontWeight.Black,
                                fontSize = 12.sp,
                                letterSpacing = 0.5.sp
                            )
                        }

                        if (!updateInfo.isMandatory) {
                            Spacer(modifier = Modifier.height(8.dp))
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
