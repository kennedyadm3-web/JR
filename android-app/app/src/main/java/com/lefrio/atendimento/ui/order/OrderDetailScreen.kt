package com.lefrio.atendimento.ui.order

import android.content.Intent
import android.net.Uri
import android.widget.Toast
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
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
import com.lefrio.atendimento.data.local.entity.EquipmentChecklistEntity
import com.lefrio.atendimento.ui.order.components.EquipmentCard
import com.lefrio.atendimento.ui.order.components.EquipmentInspectionDialog
import com.lefrio.atendimento.ui.theme.BluePrimary
import com.lefrio.atendimento.ui.theme.TextPrimary
import com.lefrio.atendimento.ui.theme.TextSecondary
import com.lefrio.atendimento.util.PhotoCaptureManager
import java.io.File

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun OrderDetailScreen(
    viewModel: OrderDetailViewModel,
    onBackClick: () -> Unit,
    onProceedToSignatureClick: (orderId: String) -> Unit
) {
    val uiState by viewModel.uiState.collectAsState()
    val context = LocalContext.current
    val photoCaptureManager = remember { PhotoCaptureManager(context) }

    var selectedItemForInspection by remember { mutableStateOf<EquipmentChecklistEntity?>(null) }
    var currentPhotoFile by remember { mutableStateOf<File?>(null) }
    var currentTargetItem by remember { mutableStateOf<EquipmentChecklistEntity?>(null) }

    // Launcher nativo da Câmera do Android
    val cameraLauncher = rememberLauncherForActivityResult(
        contract = ActivityResultContracts.TakePicture()
    ) { success ->
        if (success && currentPhotoFile != null && currentTargetItem != null) {
            val compressed = photoCaptureManager.compressPhoto(currentPhotoFile!!)
            viewModel.attachPhotoToEquipment(currentTargetItem!!, compressed.absolutePath)
            Toast.makeText(context, "Foto salva com sucesso no aparelho!", Toast.LENGTH_SHORT).show()
        }
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = {
                    Text(
                        text = "O.S. #${uiState.order?.osNumber ?: "..."}",
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
        containerColor = Color(0xFFF8FAFC),
        bottomBar = {
            uiState.order?.let { order ->
                Surface(
                    color = Color.White,
                    shadowElevation = 8.dp,
                    modifier = Modifier.fillMaxWidth()
                ) {
                    Box(modifier = Modifier.padding(16.dp)) {
                        Button(
                            onClick = { onProceedToSignatureClick(order.id) },
                            modifier = Modifier
                                .fillMaxWidth()
                                .height(48.dp),
                            shape = RoundedCornerShape(12.dp),
                            colors = ButtonDefaults.buttonColors(containerColor = BluePrimary)
                        ) {
                            Icon(imageVector = Icons.Default.Draw, contentDescription = null, modifier = Modifier.size(18.dp))
                            Spacer(modifier = Modifier.width(8.dp))
                            Text(
                                text = "COLHER ASSINATURA DO CLIENTE",
                                fontWeight = FontWeight.Black,
                                fontSize = 12.sp,
                                letterSpacing = 0.5.sp
                            )
                        }
                    }
                }
            }
        }
    ) { paddingValues ->
        val order = uiState.order

        if (order == null) {
            Box(
                modifier = Modifier
                    .fillMaxSize()
                    .padding(paddingValues),
                contentAlignment = Alignment.Center
            ) {
                CircularProgressIndicator(color = BluePrimary)
            }
        } else {
            LazyColumn(
                modifier = Modifier
                    .fillMaxSize()
                    .padding(paddingValues),
                contentPadding = PaddingValues(bottom = 24.dp)
            ) {
                // Card de Cabeçalho com Informações da O.S. e GPS
                item {
                    Card(
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(16.dp),
                        shape = RoundedCornerShape(16.dp),
                        colors = CardDefaults.cardColors(containerColor = Color.White),
                        elevation = CardDefaults.cardElevation(defaultElevation = 2.dp)
                    ) {
                        Column(modifier = Modifier.padding(16.dp)) {
                            Row(
                                modifier = Modifier.fillMaxWidth(),
                                horizontalArrangement = Arrangement.SpaceBetween,
                                verticalAlignment = Alignment.CenterVertically
                            ) {
                                Text(
                                    text = order.clientName,
                                    fontWeight = FontWeight.Black,
                                    fontSize = 15.sp,
                                    color = TextPrimary
                                )

                                if (order.status == "aberta") {
                                    Button(
                                        onClick = { viewModel.startService() },
                                        shape = RoundedCornerShape(8.dp),
                                        colors = ButtonDefaults.buttonColors(containerColor = BluePrimary),
                                        contentPadding = PaddingValues(horizontal = 10.dp, vertical = 4.dp),
                                        modifier = Modifier.height(32.dp)
                                    ) {
                                        Text(text = "INICIAR", fontSize = 10.sp, fontWeight = FontWeight.Black)
                                    }
                                }
                            }

                            Spacer(modifier = Modifier.height(8.dp))

                            // Endereço completo
                            val fullAddress = "${order.addressStreet}${order.addressNumber?.let { ", $it" } ?: ""}${order.addressCity?.let { " - $it" } ?: ""}"
                            Text(
                                text = fullAddress,
                                fontSize = 12.sp,
                                color = TextSecondary,
                                fontWeight = FontWeight.Medium
                            )

                            Spacer(modifier = Modifier.height(12.dp))

                            // Botão de Navegação GPS (Maps / Waze)
                            OutlinedButton(
                                onClick = {
                                    val gmmIntentUri = Uri.parse("geo:0,0?q=" + Uri.encode(fullAddress))
                                    val mapIntent = Intent(Intent.ACTION_VIEW, gmmIntentUri)
                                    try {
                                        context.startActivity(mapIntent)
                                    } catch (e: Exception) {
                                        Toast.makeText(context, "Nenhum aplicativo de GPS encontrado", Toast.LENGTH_SHORT).show()
                                    }
                                },
                                shape = RoundedCornerShape(10.dp),
                                modifier = Modifier.fillMaxWidth().height(38.dp)
                            ) {
                                Icon(
                                    imageVector = Icons.Default.Navigation,
                                    contentDescription = null,
                                    tint = BluePrimary,
                                    modifier = Modifier.size(16.dp)
                                )
                                Spacer(modifier = Modifier.width(6.dp))
                                Text(
                                    text = "NAVEGAR VIA GPS (MAPS / WAZE)",
                                    fontSize = 11.sp,
                                    fontWeight = FontWeight.Bold,
                                    color = BluePrimary
                                )
                            }
                        }
                    }
                }

                // Barra de Progresso dos Equipamentos
                item {
                    Column(modifier = Modifier.padding(horizontal = 16.dp, vertical = 4.dp)) {
                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.SpaceBetween,
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            Text(
                                text = "Equipamentos (${uiState.completedCount}/${uiState.totalCount})",
                                fontWeight = FontWeight.Black,
                                fontSize = 13.sp,
                                color = TextPrimary
                            )
                            Text(
                                text = "${(uiState.progressPercentage * 100).toInt()}% concluído",
                                fontWeight = FontWeight.Bold,
                                fontSize = 11.sp,
                                color = BluePrimary
                            )
                        }

                        Spacer(modifier = Modifier.height(6.dp))

                        LinearProgressIndicator(
                            progress = { uiState.progressPercentage },
                            modifier = Modifier
                                .fillMaxWidth()
                                .height(6.dp)
                                .clip(RoundedCornerShape(3.dp)),
                            color = if (uiState.progressPercentage == 1f) Color(0xFF059669) else BluePrimary,
                            trackColor = Color(0xFFE2E8F0)
                        )
                    }
                    Spacer(modifier = Modifier.height(8.dp))
                }

                // Lista de Equipamentos
                items(uiState.checklistItems, key = { it.id }) { item ->
                    val photos = viewModel.parsePhotoPaths(item.localPhotoPathsJson)
                    EquipmentCard(
                        item = item,
                        photos = photos,
                        onInspectClick = { selectedItemForInspection = item },
                        onTakePhotoClick = {
                            currentTargetItem = item
                            val (uri, file) = photoCaptureManager.createPhotoUri(order.id, item.equipmentId)
                            currentPhotoFile = file
                            cameraLauncher.launch(uri)
                        },
                        onDeletePhotoClick = { photoPath ->
                            viewModel.removePhotoFromEquipment(item, photoPath)
                        }
                    )
                }
            }
        }
    }

    // Modal de Inspeção do Equipamento
    selectedItemForInspection?.let { item ->
        EquipmentInspectionDialog(
            item = item,
            onDismissRequest = { selectedItemForInspection = null },
            onSaveInspection = { isChecked, isSkipped, notes, justification ->
                val photos = viewModel.parsePhotoPaths(item.localPhotoPathsJson)
                viewModel.saveInspection(item, isChecked, isSkipped, notes, justification, photos)
                selectedItemForInspection = null
                Toast.makeText(context, "Checklist salvo no aparelho!", Toast.LENGTH_SHORT).show()
            }
        )
    }
}
