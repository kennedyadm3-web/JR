package com.lefrio.atendimento.ui.order

import android.Manifest
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.widget.Toast
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.itemsIndexed
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
import androidx.core.content.ContextCompat
import coil.compose.AsyncImage
import com.lefrio.atendimento.data.local.entity.EquipmentChecklistEntity
import com.lefrio.atendimento.ui.order.components.EquipmentCard
import com.lefrio.atendimento.ui.signature.components.SignaturePad
import com.lefrio.atendimento.ui.signature.components.SignaturePath
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

    val signaturePaths = remember { mutableStateListOf<SignaturePath>() }

    var currentPhotoFile by remember { mutableStateOf<File?>(null) }
    var currentTargetItem by remember { mutableStateOf<EquipmentChecklistEntity?>(null) }
    var showPhotoSourceDialog by remember { mutableStateOf(false) }

    LaunchedEffect(uiState.finalizeSuccess) {
        if (uiState.finalizeSuccess) {
            Toast.makeText(context, "Atendimento finalizado e assinado com sucesso!", Toast.LENGTH_LONG).show()
        }
    }

    LaunchedEffect(uiState.errorMessage) {
        uiState.errorMessage?.let { err ->
            Toast.makeText(context, err, Toast.LENGTH_LONG).show()
            viewModel.clearErrorMessage()
        }
    }

    // Launcher da Câmera nativa protegido contra exceções e falhas de memória
    val cameraLauncher = rememberLauncherForActivityResult(
        contract = ActivityResultContracts.TakePicture()
    ) { success ->
        try {
            if (success && currentPhotoFile != null && currentTargetItem != null) {
                val compressed = photoCaptureManager.compressPhoto(currentPhotoFile!!)
                viewModel.attachPhotoToEquipment(currentTargetItem!!, compressed.absolutePath)
                Toast.makeText(context, "Foto salva com sucesso!", Toast.LENGTH_SHORT).show()
            }
        } catch (t: Throwable) {
            Toast.makeText(context, "Erro ao processar foto: ${t.message ?: "Falha na imagem"}", Toast.LENGTH_SHORT).show()
        }
    }

    // Launcher de Seleção de Foto da Galeria
    val galleryLauncher = rememberLauncherForActivityResult(
        contract = ActivityResultContracts.GetContent()
    ) { uri: Uri? ->
        try {
            if (uri != null && currentTargetItem != null && uiState.order != null) {
                val savedFile = photoCaptureManager.saveGalleryImageUri(
                    sourceUri = uri,
                    orderId = uiState.order!!.id,
                    equipmentId = currentTargetItem!!.equipmentId
                )
                if (savedFile != null) {
                    viewModel.attachPhotoToEquipment(currentTargetItem!!, savedFile.absolutePath)
                    Toast.makeText(context, "Imagem anexada com sucesso!", Toast.LENGTH_SHORT).show()
                } else {
                    Toast.makeText(context, "Não foi possível carregar o arquivo da imagem", Toast.LENGTH_SHORT).show()
                }
            }
        } catch (t: Throwable) {
            Toast.makeText(context, "Erro ao anexar imagem: ${t.message ?: "Falha na galeria"}", Toast.LENGTH_SHORT).show()
        }
    }

    // Launcher para solicitar permissão de câmera antes de disparar
    val cameraPermissionLauncher = rememberLauncherForActivityResult(
        contract = ActivityResultContracts.RequestPermission()
    ) { isGranted ->
        if (isGranted) {
            try {
                if (currentTargetItem != null && uiState.order != null) {
                    val (uri, file) = photoCaptureManager.createPhotoUri(uiState.order!!.id, currentTargetItem!!.equipmentId)
                    currentPhotoFile = file
                    cameraLauncher.launch(uri)
                }
            } catch (t: Throwable) {
                Toast.makeText(context, "Não foi possível iniciar a câmera: ${t.message ?: "Erro no app"}", Toast.LENGTH_LONG).show()
            }
        } else {
            Toast.makeText(context, "Permissão de câmera não concedida. Você pode escolher uma foto da galeria.", Toast.LENGTH_LONG).show()
        }
    }

    fun launchCameraSafely() {
        try {
            val permissionCheck = ContextCompat.checkSelfPermission(context, Manifest.permission.CAMERA)
            if (permissionCheck == PackageManager.PERMISSION_GRANTED) {
                if (currentTargetItem != null && uiState.order != null) {
                    val (uri, file) = photoCaptureManager.createPhotoUri(uiState.order!!.id, currentTargetItem!!.equipmentId)
                    currentPhotoFile = file
                    cameraLauncher.launch(uri)
                }
            } else {
                cameraPermissionLauncher.launch(Manifest.permission.CAMERA)
            }
        } catch (t: Throwable) {
            Toast.makeText(context, "Erro ao abrir câmera: ${t.message ?: "Câmera indisponível"}", Toast.LENGTH_SHORT).show()
        }
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = {
                    val isPrev = uiState.order?.type?.contains("PREVENTIVA", ignoreCase = true) == true
                    Text(
                        text = if (isPrev) "Preventiva • ${uiState.order?.osNumber ?: "..."}" else "O.S. #${uiState.order?.osNumber ?: "..."}",
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
                val isFinalized = order.status == "finalizada"
                val isFormValid = uiState.fiscalName.trim().isNotBlank() &&
                                  uiState.fiscalDoc.trim().isNotBlank() &&
                                  (signaturePaths.isNotEmpty() || !order.clientSignaturePath.isNullOrBlank()) &&
                                  uiState.completedCount > 0

                Surface(
                    color = Color.White,
                    shadowElevation = 8.dp,
                    modifier = Modifier.fillMaxWidth()
                ) {
                    Column(modifier = Modifier.padding(16.dp)) {
                        if (isFinalized) {
                            Box(
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .height(48.dp)
                                    .clip(RoundedCornerShape(12.dp))
                                    .background(Color(0xFFD1FAE5)),
                                contentAlignment = Alignment.Center
                            ) {
                                Row(verticalAlignment = Alignment.CenterVertically) {
                                    Icon(
                                        imageVector = Icons.Default.CheckCircle,
                                        contentDescription = null,
                                        tint = Color(0xFF059669),
                                        modifier = Modifier.size(20.dp)
                                    )
                                    Spacer(modifier = Modifier.width(8.dp))
                                    Text(
                                        text = "ATENDIMENTO FINALIZADO E REGISTRADO",
                                        fontWeight = FontWeight.Black,
                                        fontSize = 12.sp,
                                        color = Color(0xFF065F46)
                                    )
                                }
                            }
                        } else {
                            Button(
                                onClick = {
                                    viewModel.finalizeOrder(context, signaturePaths)
                                },
                                enabled = isFormValid && !uiState.isFinalizing,
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .height(48.dp),
                                shape = RoundedCornerShape(12.dp),
                                colors = ButtonDefaults.buttonColors(
                                    containerColor = if (isFormValid) Color(0xFF059669) else Color(0xFFCBD5E1),
                                    contentColor = Color.White
                                )
                            ) {
                                if (uiState.isFinalizing) {
                                    CircularProgressIndicator(
                                        modifier = Modifier.size(20.dp),
                                        color = Color.White,
                                        strokeWidth = 2.dp
                                    )
                                    Spacer(modifier = Modifier.width(8.dp))
                                    Text("FINALIZANDO E GRAVANDO...", fontWeight = FontWeight.Black, fontSize = 12.sp)
                                } else {
                                    Icon(imageVector = Icons.Default.Check, contentDescription = null, modifier = Modifier.size(18.dp))
                                    Spacer(modifier = Modifier.width(8.dp))
                                    Text(
                                        text = "FINALIZAR ATENDIMENTO",
                                        fontWeight = FontWeight.Black,
                                        fontSize = 12.sp,
                                        letterSpacing = 0.5.sp
                                    )
                                }
                            }

                            if (!isFormValid) {
                                Spacer(modifier = Modifier.height(6.dp))
                                val pendingList = buildList {
                                    if (uiState.fiscalName.trim().isBlank()) add("Nome")
                                    if (uiState.fiscalDoc.trim().isBlank()) add("Matrícula/CPF")
                                    if (signaturePaths.isEmpty() && order.clientSignaturePath.isNullOrBlank()) add("Assinatura")
                                    if (uiState.completedCount == 0) add("Atender ≥1 máquina")
                                }.joinToString(", ")

                                Text(
                                    text = "Pendente para liberar finalização: $pendingList",
                                    fontSize = 10.sp,
                                    fontWeight = FontWeight.Bold,
                                    color = Color(0xFFDC2626)
                                )
                            }
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
                            .padding(14.dp),
                        shape = RoundedCornerShape(16.dp),
                        colors = CardDefaults.cardColors(containerColor = Color.White),
                        elevation = CardDefaults.cardElevation(defaultElevation = 2.dp)
                    ) {
                        Column(modifier = Modifier.padding(16.dp)) {
                            val isPrev = order.type.contains("PREVENTIVA", ignoreCase = true)
                            Row(
                                verticalAlignment = Alignment.CenterVertically,
                                modifier = Modifier
                                    .clip(RoundedCornerShape(6.dp))
                                    .background(if (isPrev) Color(0xFFE0F2FE) else Color(0xFFF3E8FF))
                                    .padding(horizontal = 8.dp, vertical = 3.dp)
                            ) {
                                Text(
                                    text = if (isPrev) "MANUTENÇÃO PREVENTIVA (PMOC)" else "ORDEM DE SERVIÇO",
                                    fontSize = 10.sp,
                                    fontWeight = FontWeight.Black,
                                    color = if (isPrev) Color(0xFF0369A1) else Color(0xFF6B21A8)
                                )
                            }

                            Spacer(modifier = Modifier.height(8.dp))

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
                                        Text(text = "INICIAR ATENDIMENTO", fontSize = 10.sp, fontWeight = FontWeight.Black)
                                    }
                                }
                            }

                            Spacer(modifier = Modifier.height(6.dp))

                            // Endereço completo
                            val fullAddress = "${order.addressStreet}${order.addressNumber?.let { ", $it" } ?: ""}${order.addressCity?.let { " - $it" } ?: ""}"
                            Text(
                                text = fullAddress,
                                fontSize = 12.sp,
                                color = TextSecondary,
                                fontWeight = FontWeight.Medium
                            )

                            Spacer(modifier = Modifier.height(10.dp))

                            // Botão de Navegação GPS
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
                    Column(modifier = Modifier.padding(horizontal = 14.dp, vertical = 4.dp)) {
                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.SpaceBetween,
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            Text(
                                text = "Máquinas da Planilha (${uiState.completedCount}/${uiState.totalCount})",
                                fontWeight = FontWeight.Black,
                                fontSize = 13.sp,
                                color = TextPrimary
                            )
                            Text(
                                text = "${(uiState.progressPercentage * 100).toInt()}% atendido",
                                fontWeight = FontWeight.Bold,
                                fontSize = 11.sp,
                                color = BluePrimary
                            )
                        }

                        Spacer(modifier = Modifier.height(6.dp))

                        LinearProgressIndicator(
                            progress = uiState.progressPercentage,
                            modifier = Modifier
                                .fillMaxWidth()
                                .height(6.dp)
                                .clip(RoundedCornerShape(3.dp)),
                            color = if (uiState.progressPercentage == 1f) Color(0xFF059669) else BluePrimary,
                            trackColor = Color(0xFFE2E8F0)
                        )
                    }
                    Spacer(modifier = Modifier.height(6.dp))
                }

                // Lista de Equipamentos (Cards expansíveis inline como no PWA)
                itemsIndexed(uiState.checklistItems, key = { _, item -> item.id }) { index, item ->
                    val photos = viewModel.parsePhotoPaths(item.localPhotoPathsJson)
                    EquipmentCard(
                        orderIndex = index + 1,
                        item = item,
                        photos = photos,
                        onToggleAttend = {
                            viewModel.toggleAttendEquipment(item)
                        },
                        onToggleSkip = {
                            viewModel.toggleSkipEquipment(item)
                        },
                        onTakePhotoClick = {
                            currentTargetItem = item
                            showPhotoSourceDialog = true
                        },
                        onDeletePhotoClick = { photoPath ->
                            viewModel.removePhotoFromEquipment(item, photoPath)
                        },
                        onSaveNotes = { notes ->
                            viewModel.updateEquipmentNotes(item, notes)
                        },
                        isOrderCompleted = order.status == "finalizada"
                    )
                }

                // SEÇÃO DO RESPONSÁVEL DO CLIENTE E ASSINATURA DIGITAL (Fim da Folha de Atendimento)
                item {
                    Card(
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(horizontal = 14.dp, vertical = 12.dp),
                        shape = RoundedCornerShape(16.dp),
                        colors = CardDefaults.cardColors(containerColor = Color.White),
                        elevation = CardDefaults.cardElevation(defaultElevation = 2.dp)
                    ) {
                        Column(modifier = Modifier.padding(16.dp)) {
                            Row(verticalAlignment = Alignment.CenterVertically) {
                                Box(
                                    modifier = Modifier
                                        .size(32.dp)
                                        .clip(RoundedCornerShape(8.dp))
                                        .background(BluePrimary.copy(alpha = 0.12f)),
                                    contentAlignment = Alignment.Center
                                ) {
                                    Icon(
                                        imageVector = Icons.Default.Badge,
                                        contentDescription = null,
                                        tint = BluePrimary,
                                        modifier = Modifier.size(18.dp)
                                    )
                                }
                                Spacer(modifier = Modifier.width(10.dp))
                                Column {
                                    Text(
                                        text = "RESPONSÁVEL / FISCAL DO CLIENTE",
                                        fontWeight = FontWeight.Black,
                                        fontSize = 13.sp,
                                        color = TextPrimary
                                    )
                                    Text(
                                        text = "Dados obrigatórios no fim da folha para fechamento do serviço",
                                        fontSize = 10.sp,
                                        color = TextSecondary
                                    )
                                }
                            }

                            Spacer(modifier = Modifier.height(14.dp))

                            // Campo 1: Nome do Responsável / Fiscal
                            OutlinedTextField(
                                value = uiState.fiscalName,
                                onValueChange = { viewModel.updateFiscalName(it) },
                                label = { Text("Nome Completo do Responsável / Fiscal", fontSize = 11.sp) },
                                placeholder = { Text("Ex: João Carlos Silva", fontSize = 11.sp) },
                                modifier = Modifier.fillMaxWidth(),
                                shape = RoundedCornerShape(10.dp),
                                singleLine = true,
                                enabled = order.status != "finalizada",
                                colors = OutlinedTextFieldDefaults.colors(
                                    focusedContainerColor = Color.White,
                                    unfocusedContainerColor = Color.White
                                )
                            )

                            Spacer(modifier = Modifier.height(10.dp))

                            // Campo 2: Matrícula ou CPF do Responsável / Fiscal
                            OutlinedTextField(
                                value = uiState.fiscalDoc,
                                onValueChange = { viewModel.updateFiscalDoc(it) },
                                label = { Text("Matrícula ou CPF do Responsável", fontSize = 11.sp) },
                                placeholder = { Text("Ex: 123456 ou 000.000.000-00", fontSize = 11.sp) },
                                modifier = Modifier.fillMaxWidth(),
                                shape = RoundedCornerShape(10.dp),
                                singleLine = true,
                                enabled = order.status != "finalizada",
                                colors = OutlinedTextFieldDefaults.colors(
                                    focusedContainerColor = Color.White,
                                    unfocusedContainerColor = Color.White
                                )
                            )

                            Spacer(modifier = Modifier.height(16.dp))

                            // Campo 3: Área de Assinatura Digital
                            Row(
                                modifier = Modifier.fillMaxWidth(),
                                horizontalArrangement = Arrangement.SpaceBetween,
                                verticalAlignment = Alignment.CenterVertically
                            ) {
                                Row(verticalAlignment = Alignment.CenterVertically) {
                                    Icon(
                                        imageVector = Icons.Default.Draw,
                                        contentDescription = null,
                                        tint = BluePrimary,
                                        modifier = Modifier.size(16.dp)
                                    )
                                    Spacer(modifier = Modifier.width(6.dp))
                                    Text(
                                        text = "Assinatura Digital do Responsável",
                                        fontWeight = FontWeight.Bold,
                                        fontSize = 12.sp,
                                        color = TextPrimary
                                    )
                                }

                                if (signaturePaths.isNotEmpty() || uiState.hasSignature) {
                                    Text(
                                        text = "✓ Assinatura Coletada",
                                        fontWeight = FontWeight.Black,
                                        fontSize = 11.sp,
                                        color = Color(0xFF059669)
                                    )
                                }
                            }

                            Spacer(modifier = Modifier.height(8.dp))

                            val sigPath = order.clientSignaturePath
                            if (order.status == "finalizada" && !sigPath.isNullOrBlank()) {
                                Box(
                                    modifier = Modifier
                                        .fillMaxWidth()
                                        .height(140.dp)
                                        .clip(RoundedCornerShape(12.dp))
                                        .background(Color(0xFFFAFAFA))
                                        .border(1.dp, Color(0xFFCBD5E1), RoundedCornerShape(12.dp)),
                                    contentAlignment = Alignment.Center
                                ) {
                                    AsyncImage(
                                        model = File(sigPath),
                                        contentDescription = "Assinatura Registrada",
                                        modifier = Modifier.fillMaxSize()
                                    )
                                }
                            } else {
                                SignaturePad(
                                    modifier = Modifier
                                        .fillMaxWidth()
                                        .height(190.dp),
                                    paths = signaturePaths,
                                    onSignatureChanged = { hasSig ->
                                        viewModel.updateHasSignature(hasSig)
                                    }
                                )
                            }
                        }
                    }
                }
            }
        }
    }

    // Diálogo Seguro de Escolha da Imagem (Tirar Foto ou Galeria)
    if (showPhotoSourceDialog) {
        AlertDialog(
            onDismissRequest = { showPhotoSourceDialog = false },
            title = {
                Text(
                    text = "Anexar Evidência da Máquina",
                    fontWeight = FontWeight.Black,
                    fontSize = 15.sp,
                    color = TextPrimary
                )
            },
            text = {
                Column(modifier = Modifier.fillMaxWidth()) {
                    Text(
                        text = "Escolha como deseja anexar a foto:",
                        fontSize = 12.sp,
                        color = TextSecondary
                    )
                    Spacer(modifier = Modifier.height(14.dp))

                    // Opção 1: Câmera
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .clip(RoundedCornerShape(10.dp))
                            .clickable {
                                showPhotoSourceDialog = false
                                launchCameraSafely()
                            }
                            .padding(12.dp),
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Icon(
                            imageVector = Icons.Default.CameraAlt,
                            contentDescription = "Câmera",
                            tint = BluePrimary,
                            modifier = Modifier.size(20.dp)
                        )
                        Spacer(modifier = Modifier.width(12.dp))
                        Text(
                            text = "Tirar Foto com a Câmera",
                            fontWeight = FontWeight.Bold,
                            fontSize = 13.sp,
                            color = TextPrimary
                        )
                    }

                    Spacer(modifier = Modifier.height(6.dp))

                    // Opção 2: Galeria
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .clip(RoundedCornerShape(10.dp))
                            .clickable {
                                showPhotoSourceDialog = false
                                try {
                                    galleryLauncher.launch("image/*")
                                } catch (e: Exception) {
                                    Toast.makeText(context, "Erro ao abrir galeria: ${e.message}", Toast.LENGTH_SHORT).show()
                                }
                            }
                            .padding(12.dp),
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Icon(
                            imageVector = Icons.Default.PhotoLibrary,
                            contentDescription = "Galeria",
                            tint = Color(0xFF059669),
                            modifier = Modifier.size(20.dp)
                        )
                        Spacer(modifier = Modifier.width(12.dp))
                        Text(
                            text = "Escolher Imagem da Galeria",
                            fontWeight = FontWeight.Bold,
                            fontSize = 13.sp,
                            color = TextPrimary
                        )
                    }
                }
            },
            confirmButton = {},
            dismissButton = {
                TextButton(onClick = { showPhotoSourceDialog = false }) {
                    Text(text = "Cancelar", fontWeight = FontWeight.Bold, color = TextSecondary)
                }
            },
            shape = RoundedCornerShape(18.dp),
            containerColor = Color.White
        )
    }
}
