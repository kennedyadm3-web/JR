package com.lefrio.atendimento.ui.signature

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
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.lefrio.atendimento.ui.signature.components.SignaturePad
import com.lefrio.atendimento.ui.signature.components.SignaturePath
import com.lefrio.atendimento.ui.theme.BluePrimary
import com.lefrio.atendimento.ui.theme.TextPrimary
import com.lefrio.atendimento.ui.theme.TextSecondary

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun SignatureScreen(
    viewModel: SignatureViewModel,
    onBackClick: () -> Unit,
    onSuccessFinish: () -> Unit
) {
    val order by viewModel.order.collectAsState()
    val uiState by viewModel.uiState.collectAsState()
    val gpsLocation by viewModel.gpsLocation.collectAsState()

    var signeeName by remember { mutableStateOf("") }
    var signeeDoc by remember { mutableStateOf("") }
    val paths = remember { mutableStateListOf<SignaturePath>() }
    var hasSignature by remember { mutableStateOf(false) }

    LaunchedEffect(order) {
        order?.clientRepresentative?.let { if (it.isNotBlank()) signeeName = it }
        order?.clientSigneeDoc?.let { if (it.isNotBlank()) signeeDoc = it }
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = {
                    Text(
                        text = "Assinatura do Cliente",
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
        if (uiState is SignatureUiState.Success) {
            // Tela de Sucesso / Comprovante
            val success = uiState as SignatureUiState.Success
            Box(
                modifier = Modifier
                    .fillMaxSize()
                    .padding(paddingValues)
                    .padding(24.dp),
                contentAlignment = Alignment.Center
            ) {
                Card(
                    modifier = Modifier.fillMaxWidth(),
                    shape = RoundedCornerShape(20.dp),
                    colors = CardDefaults.cardColors(containerColor = Color.White),
                    elevation = CardDefaults.cardElevation(defaultElevation = 4.dp)
                ) {
                    Column(
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(28.dp),
                        horizontalAlignment = Alignment.CenterHorizontally
                    ) {
                        Box(
                            modifier = Modifier
                                .size(64.dp)
                                .clip(RoundedCornerShape(32.dp))
                                .background(Color(0xFFD1FAE5)),
                            contentAlignment = Alignment.Center
                        ) {
                            Icon(
                                imageVector = Icons.Default.CheckCircle,
                                contentDescription = null,
                                tint = Color(0xFF059669),
                                modifier = Modifier.size(36.dp)
                            )
                        }

                        Spacer(modifier = Modifier.height(16.dp))

                        Text(
                            text = "Atendimento Concluído!",
                            fontWeight = FontWeight.Black,
                            fontSize = 18.sp,
                            color = TextPrimary
                        )

                        Text(
                            text = "A Ordem de Serviço #${order?.osNumber} foi finalizada e assinada com sucesso.",
                            fontSize = 12.sp,
                            color = TextSecondary,
                            textAlign = TextAlign.Center
                        )

                        Spacer(modifier = Modifier.height(16.dp))

                        Box(
                            modifier = Modifier
                                .fillMaxWidth()
                                .clip(RoundedCornerShape(10.dp))
                                .background(Color(0xFFF1F5F9))
                                .padding(12.dp)
                        ) {
                            Column {
                                Text(
                                    text = "Recebedor: $signeeName",
                                    fontSize = 11.sp,
                                    fontWeight = FontWeight.Bold,
                                    color = TextPrimary
                                )
                                Text(
                                    text = "Documento: $signeeDoc",
                                    fontSize = 11.sp,
                                    color = TextSecondary
                                )
                                Text(
                                    text = "Encerramento: ${success.completionDate}",
                                    fontSize = 11.sp,
                                    color = TextSecondary
                                )
                            }
                        }

                        Spacer(modifier = Modifier.height(24.dp))

                        Button(
                            onClick = onSuccessFinish,
                            modifier = Modifier
                                .fillMaxWidth()
                                .height(46.dp),
                            shape = RoundedCornerShape(12.dp),
                            colors = ButtonDefaults.buttonColors(containerColor = BluePrimary)
                        ) {
                            Text(
                                text = "VOLTAR AO PAINEL",
                                fontWeight = FontWeight.Black,
                                fontSize = 12.sp
                            )
                        }
                    }
                }
            }
        } else {
            Column(
                modifier = Modifier
                    .fillMaxSize()
                    .padding(paddingValues)
                    .verticalScroll(rememberScrollState())
                    .padding(16.dp)
            ) {
                // Resumo do Chamado
                Card(
                    modifier = Modifier.fillMaxWidth(),
                    shape = RoundedCornerShape(14.dp),
                    colors = CardDefaults.cardColors(containerColor = Color.White),
                    elevation = CardDefaults.cardElevation(defaultElevation = 1.dp)
                ) {
                    Column(modifier = Modifier.padding(14.dp)) {
                        Text(
                            text = order?.clientName ?: "Cliente",
                            fontWeight = FontWeight.Black,
                            fontSize = 13.sp,
                            color = TextPrimary
                        )
                        Text(
                            text = "O.S. #${order?.osNumber} • ${order?.type}",
                            fontSize = 11.sp,
                            color = TextSecondary
                        )

                        Spacer(modifier = Modifier.height(8.dp))

                        // Status do GPS
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Icon(
                                imageVector = Icons.Default.LocationOn,
                                contentDescription = null,
                                tint = if (gpsLocation?.isCaptured == true) Color(0xFF059669) else Color(0xFFD97706),
                                modifier = Modifier.size(14.dp)
                            )
                            Spacer(modifier = Modifier.width(4.dp))
                            Text(
                                text = if (gpsLocation?.isCaptured == true)
                                    "GPS de Auditoria ativo (Precisão: ${gpsLocation?.accuracy?.toInt()}m)"
                                else
                                    "Coletando coordenadas GPS de auditoria...",
                                fontSize = 10.sp,
                                fontWeight = FontWeight.SemiBold,
                                color = if (gpsLocation?.isCaptured == true) Color(0xFF059669) else Color(0xFFD97706)
                            )
                        }
                    }
                }

                Spacer(modifier = Modifier.height(14.dp))

                // Dados do Recebedor
                Text(
                    text = "Dados do Recebedor no Cliente:",
                    fontWeight = FontWeight.Bold,
                    fontSize = 12.sp,
                    color = TextPrimary
                )

                Spacer(modifier = Modifier.height(8.dp))

                OutlinedTextField(
                    value = signeeName,
                    onValueChange = { signeeName = it },
                    label = { Text("Nome Completo do Recebedor", fontSize = 11.sp) },
                    leadingIcon = {
                        Icon(imageVector = Icons.Default.Person, contentDescription = null, tint = BluePrimary, modifier = Modifier.size(18.dp))
                    },
                    modifier = Modifier.fillMaxWidth(),
                    shape = RoundedCornerShape(10.dp),
                    singleLine = true
                )

                Spacer(modifier = Modifier.height(10.dp))

                OutlinedTextField(
                    value = signeeDoc,
                    onValueChange = { signeeDoc = it },
                    label = { Text("Documento (RG ou CPF)", fontSize = 11.sp) },
                    leadingIcon = {
                        Icon(imageVector = Icons.Default.Badge, contentDescription = null, tint = BluePrimary, modifier = Modifier.size(18.dp))
                    },
                    modifier = Modifier.fillMaxWidth(),
                    shape = RoundedCornerShape(10.dp),
                    singleLine = true
                )

                Spacer(modifier = Modifier.height(16.dp))

                // Campo da Assinatura Digital
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Text(
                        text = "Assinatura do Recebedor:",
                        fontWeight = FontWeight.Bold,
                        fontSize = 12.sp,
                        color = TextPrimary
                    )

                    if (hasSignature) {
                        Text(
                            text = "✓ Assinatura coletada",
                            color = Color(0xFF059669),
                            fontSize = 11.sp,
                            fontWeight = FontWeight.Bold
                        )
                    }
                }

                Spacer(modifier = Modifier.height(8.dp))

                SignaturePad(
                    modifier = Modifier
                        .fillMaxWidth()
                        .height(200.dp),
                    paths = paths,
                    onSignatureChanged = { hasSignature = it }
                )

                Spacer(modifier = Modifier.height(12.dp))

                // Mensagem de Erro
                if (uiState is SignatureUiState.Error) {
                    Text(
                        text = (uiState as SignatureUiState.Error).message,
                        color = MaterialTheme.colorScheme.error,
                        fontSize = 11.sp,
                        fontWeight = FontWeight.Bold
                    )
                    Spacer(modifier = Modifier.height(8.dp))
                }

                // Termo Legal
                Text(
                    text = "Declaro que os serviços e inspeções preventivas/corretivas foram devidamente executados nas máquinas listadas neste relatório.",
                    fontSize = 10.sp,
                    color = TextSecondary,
                    lineHeight = 14.sp
                )

                Spacer(modifier = Modifier.height(20.dp))

                // Botão de Finalizar
                Button(
                    onClick = {
                        viewModel.finalizeOrder(
                            signeeName = signeeName,
                            signeeDoc = signeeDoc,
                            signaturePaths = paths
                        )
                    },
                    modifier = Modifier
                        .fillMaxWidth()
                        .height(48.dp),
                    shape = RoundedCornerShape(12.dp),
                    colors = ButtonDefaults.buttonColors(containerColor = Color(0xFF059669)),
                    enabled = uiState !is SignatureUiState.Finalizing
                ) {
                    if (uiState is SignatureUiState.Finalizing) {
                        CircularProgressIndicator(color = Color.White, modifier = Modifier.size(20.dp), strokeWidth = 2.dp)
                    } else {
                        Icon(imageVector = Icons.Default.Check, contentDescription = null, modifier = Modifier.size(18.dp))
                        Spacer(modifier = Modifier.width(6.dp))
                        Text(
                            text = "FINALIZAR E ASSINAR ATENDIMENTO",
                            fontWeight = FontWeight.Black,
                            fontSize = 12.sp,
                            letterSpacing = 0.5.sp
                        )
                    }
                }
            }
        }
    }
}
