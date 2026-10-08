package com.lefrio.atendimento.ui.profile

import android.content.Context
import android.net.ConnectivityManager
import android.net.NetworkCapabilities
import android.os.Environment
import android.os.StatFs
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.lefrio.atendimento.data.auth.TechnicianUser
import com.lefrio.atendimento.ui.theme.BluePrimary
import com.lefrio.atendimento.ui.theme.TextPrimary
import com.lefrio.atendimento.ui.theme.TextSecondary
import java.io.File
import java.util.Locale

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun TechProfileScreen(
    user: TechnicianUser,
    appVersion: String,
    pendingSyncCount: Int,
    onBackClick: () -> Unit,
    onCheckUpdateClick: () -> Unit,
    onForceSyncClick: () -> Unit,
    onLogoutClick: () -> Unit
) {
    val context = LocalContext.current

    // Diagnósticos de Hardware / Sistema
    val (networkType, networkColor) = remember {
        val cm = context.getSystemService(Context.CONNECTIVITY_SERVICE) as ConnectivityManager
        val cap = cm.getNetworkCapabilities(cm.activeNetwork)
        when {
            cap == null -> Pair("Offline (Sem Conexão)", Color(0xFFDC2626))
            cap.hasTransport(NetworkCapabilities.TRANSPORT_WIFI) -> Pair("Conectado via Wi-Fi", Color(0xFF059669))
            cap.hasTransport(NetworkCapabilities.TRANSPORT_CELLULAR) -> Pair("Conectado via 4G / 5G", Color(0xFF059669))
            else -> Pair("Conectado", Color(0xFF059669))
        }
    }

    val freeSpaceGb = remember {
        try {
            val stat = StatFs(Environment.getDataDirectory().path)
            val bytesAvailable = stat.availableBlocksLong * stat.blockSizeLong
            bytesAvailable.toDouble() / (1024 * 1024 * 1024)
        } catch (_: Exception) {
            0.0
        }
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = {
                    Text(
                        text = "Meu Perfil & Diagnóstico",
                        fontSize = 16.sp,
                        fontWeight = FontWeight.Black,
                        color = BluePrimary
                    )
                },
                navigationIcon = {
                    IconButton(onClick = onBackClick) {
                        Icon(imageVector = Icons.Default.ArrowBack, contentDescription = "Voltar", tint = TextPrimary)
                    }
                },
                colors = TopAppBarDefaults.topAppBarColors(containerColor = Color.White)
            )
        },
        containerColor = Color(0xFFF8FAFC)
    ) { paddingValues ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(paddingValues)
                .verticalScroll(rememberScrollState())
                .padding(16.dp)
        ) {
            // Card de Identificação do Técnico
            Card(
                modifier = Modifier.fillMaxWidth(),
                shape = RoundedCornerShape(18.dp),
                colors = CardDefaults.cardColors(containerColor = Color.White),
                elevation = CardDefaults.cardElevation(defaultElevation = 2.dp)
            ) {
                Column(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(20.dp),
                    horizontalAlignment = Alignment.CenterHorizontally
                ) {
                    Box(
                        modifier = Modifier
                            .size(68.dp)
                            .clip(RoundedCornerShape(34.dp))
                            .background(BluePrimary.copy(alpha = 0.12f)),
                        contentAlignment = Alignment.Center
                    ) {
                        Text(
                            text = user.name.take(2).uppercase(),
                            fontWeight = FontWeight.Black,
                            fontSize = 22.sp,
                            color = BluePrimary
                        )
                    }

                    Spacer(modifier = Modifier.height(12.dp))

                    Text(
                        text = user.name,
                        fontWeight = FontWeight.Black,
                        fontSize = 17.sp,
                        color = TextPrimary
                    )

                    Text(
                        text = user.email,
                        fontSize = 12.sp,
                        color = TextSecondary
                    )

                    Spacer(modifier = Modifier.height(6.dp))

                    Box(
                        modifier = Modifier
                            .clip(RoundedCornerShape(6.dp))
                            .background(Color(0xFFEFF6FF))
                            .padding(horizontal = 10.dp, vertical = 4.dp)
                    ) {
                        Text(
                            text = "TÉCNICO OPERACIONAL DE CAMPO",
                            fontSize = 9.sp,
                            fontWeight = FontWeight.Black,
                            color = BluePrimary,
                            letterSpacing = 0.5.sp
                        )
                    }
                }
            }

            Spacer(modifier = Modifier.height(16.dp))

            // Card de Diagnóstico do Aparelho (Telemetria)
            Text(
                text = "Diagnóstico do Aparelho",
                fontSize = 13.sp,
                fontWeight = FontWeight.Bold,
                color = TextPrimary
            )

            Spacer(modifier = Modifier.height(8.dp))

            Card(
                modifier = Modifier.fillMaxWidth(),
                shape = RoundedCornerShape(16.dp),
                colors = CardDefaults.cardColors(containerColor = Color.White),
                elevation = CardDefaults.cardElevation(defaultElevation = 1.dp)
            ) {
                Column(modifier = Modifier.padding(16.dp)) {
                    // Status da Rede
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Icon(imageVector = Icons.Default.Wifi, contentDescription = null, tint = networkColor, modifier = Modifier.size(18.dp))
                            Spacer(modifier = Modifier.width(10.dp))
                            Text(text = "Conexão de Dados", fontSize = 12.sp, color = TextPrimary, fontWeight = FontWeight.Medium)
                        }
                        Text(text = networkType, fontSize = 11.sp, color = networkColor, fontWeight = FontWeight.Bold)
                    }

                    Divider(color = Color(0xFFF1F5F9), modifier = Modifier.padding(vertical = 12.dp))

                    // Fila de Sincronização Local
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Icon(
                                imageVector = Icons.Default.CloudSync,
                                contentDescription = null,
                                tint = if (pendingSyncCount == 0) Color(0xFF059669) else Color(0xFFD97706),
                                modifier = Modifier.size(18.dp)
                            )
                            Spacer(modifier = Modifier.width(10.dp))
                            Text(text = "Fila de Sincronização", fontSize = 12.sp, color = TextPrimary, fontWeight = FontWeight.Medium)
                        }
                        Text(
                            text = if (pendingSyncCount == 0) "100% Sincronizado" else "$pendingSyncCount pendente(s)",
                            fontSize = 11.sp,
                            color = if (pendingSyncCount == 0) Color(0xFF059669) else Color(0xFFD97706),
                            fontWeight = FontWeight.Bold
                        )
                    }

                    Divider(color = Color(0xFFF1F5F9), modifier = Modifier.padding(vertical = 12.dp))

                    // Espaço Livre no Disco
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Icon(imageVector = Icons.Default.Storage, contentDescription = null, tint = BluePrimary, modifier = Modifier.size(18.dp))
                            Spacer(modifier = Modifier.width(10.dp))
                            Text(text = "Espaço para Fotos & PDF", fontSize = 12.sp, color = TextPrimary, fontWeight = FontWeight.Medium)
                        }
                        Text(
                            text = "${String.format(Locale.GERMANY, "%.1f", freeSpaceGb)} GB livres",
                            fontSize = 11.sp,
                            color = TextPrimary,
                            fontWeight = FontWeight.Bold
                        )
                    }

                    Divider(color = Color(0xFFF1F5F9), modifier = Modifier.padding(vertical = 12.dp))

                    // Banco de Dados Local Room
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Icon(imageVector = Icons.Default.Security, contentDescription = null, tint = Color(0xFF059669), modifier = Modifier.size(18.dp))
                            Spacer(modifier = Modifier.width(10.dp))
                            Text(text = "Banco Room Offline", fontSize = 12.sp, color = TextPrimary, fontWeight = FontWeight.Medium)
                        }
                        Text(text = "Ativo & Seguro", fontSize = 11.sp, color = Color(0xFF059669), fontWeight = FontWeight.Bold)
                    }
                }
            }

            Spacer(modifier = Modifier.height(16.dp))

            // Versão e Atualizações
            Text(
                text = "Versão do Sistema",
                fontSize = 13.sp,
                fontWeight = FontWeight.Bold,
                color = TextPrimary
            )

            Spacer(modifier = Modifier.height(8.dp))

            Card(
                modifier = Modifier.fillMaxWidth(),
                shape = RoundedCornerShape(16.dp),
                colors = CardDefaults.cardColors(containerColor = Color.White),
                elevation = CardDefaults.cardElevation(defaultElevation = 1.dp)
            ) {
                Column(modifier = Modifier.padding(16.dp)) {
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Column {
                            Text(text = "LeFrio Atendimento Android", fontSize = 12.sp, fontWeight = FontWeight.Bold, color = TextPrimary)
                            Text(text = "Versão instalada: $appVersion", fontSize = 11.sp, color = TextSecondary)
                        }

                        Box(
                            modifier = Modifier
                                .clip(RoundedCornerShape(6.dp))
                                .background(Color(0xFFD1FAE5))
                                .padding(horizontal = 8.dp, vertical = 3.dp)
                        ) {
                            Text(text = "OFICIAL", fontSize = 9.sp, fontWeight = FontWeight.Black, color = Color(0xFF059669))
                        }
                    }

                    Spacer(modifier = Modifier.height(14.dp))

                    Button(
                        onClick = onCheckUpdateClick,
                        modifier = Modifier.fillMaxWidth().height(42.dp),
                        shape = RoundedCornerShape(10.dp),
                        colors = ButtonDefaults.buttonColors(containerColor = BluePrimary)
                    ) {
                        Icon(imageVector = Icons.Default.SystemUpdate, contentDescription = null, modifier = Modifier.size(16.dp))
                        Spacer(modifier = Modifier.width(8.dp))
                        Text(text = "VERIFICAR ATUALIZAÇÕES DO APP", fontSize = 11.sp, fontWeight = FontWeight.Black)
                    }

                    Spacer(modifier = Modifier.height(8.dp))

                    OutlinedButton(
                        onClick = onForceSyncClick,
                        modifier = Modifier.fillMaxWidth().height(42.dp),
                        shape = RoundedCornerShape(10.dp)
                    ) {
                        Icon(imageVector = Icons.Default.Refresh, contentDescription = null, tint = BluePrimary, modifier = Modifier.size(16.dp))
                        Spacer(modifier = Modifier.width(8.dp))
                        Text(text = "FORÇAR SINCRONIZAÇÃO COMPLETA", fontSize = 11.sp, fontWeight = FontWeight.Bold, color = BluePrimary)
                    }
                }
            }

            Spacer(modifier = Modifier.height(24.dp))

            // Botão Sair da Conta
            OutlinedButton(
                onClick = onLogoutClick,
                modifier = Modifier.fillMaxWidth().height(46.dp),
                shape = RoundedCornerShape(12.dp),
                colors = ButtonDefaults.outlinedButtonColors(contentColor = Color(0xFFDC2626))
            ) {
                Icon(imageVector = Icons.Default.ExitToApp, contentDescription = null, tint = Color(0xFFDC2626), modifier = Modifier.size(18.dp))
                Spacer(modifier = Modifier.width(8.dp))
                Text(text = "SAIR DA CONTA (LOGOFF)", fontWeight = FontWeight.Bold, fontSize = 12.sp, color = Color(0xFFDC2626))
            }

            Spacer(modifier = Modifier.height(20.dp))
        }
    }
}
