package com.lefrio.atendimento.ui.serviceorders

import android.Manifest
import android.content.pm.PackageManager
import android.net.Uri
import android.util.Base64
import android.widget.Toast
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardCapitalization
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.window.Dialog
import androidx.core.content.ContextCompat
import coil.compose.AsyncImage
import com.lefrio.atendimento.data.auth.TechnicianUser
import com.lefrio.atendimento.data.local.LocalServiceOrderDraft
import com.lefrio.atendimento.data.local.ServiceOrderDraftStorage
import com.lefrio.atendimento.ui.signature.components.SignaturePad
import com.lefrio.atendimento.ui.signature.components.SignaturePath
import com.lefrio.atendimento.ui.signature.components.saveSignatureToLocalFile
import com.lefrio.atendimento.ui.theme.BluePrimary
import com.lefrio.atendimento.ui.theme.TextPrimary
import com.lefrio.atendimento.ui.theme.TextSecondary
import com.lefrio.atendimento.util.PhotoCaptureManager
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import java.io.File
import java.util.*

private fun fileToBase64(file: File): String? {
    return try {
        val bytes = file.readBytes()
        "data:image/png;base64," + Base64.encodeToString(bytes, Base64.NO_WRAP)
    } catch (e: Exception) {
        null
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun CreateServiceOrderScreen(
    user: TechnicianUser,
    viewModel: ServiceOrdersViewModel,
    initialDraft: LocalServiceOrderDraft? = null,
    onBackClick: () -> Unit,
    onDraftSaved: () -> Unit = onBackClick,
    onOrderCreated: (orderId: String) -> Unit
) {
    val uiState by viewModel.uiState.collectAsState()
    val context = LocalContext.current

    // Campos de Seleção do Local do Roteiro (restaurados caso seja continuação de uma O.S. salva)
    var currentDraftId by remember(initialDraft?.id) { mutableStateOf(initialDraft?.id) }
    var selectedClientId by remember(initialDraft?.id) { mutableStateOf(initialDraft?.clientId.orEmpty()) }
    var selectedClientName by remember(initialDraft?.id) { mutableStateOf(initialDraft?.clientName.orEmpty()) }
    var selectedAddressId by remember(initialDraft?.id) { mutableStateOf(initialDraft?.addressId.orEmpty()) }
    var selectedAddressStreet by remember(initialDraft?.id) { mutableStateOf(initialDraft?.addressStreet.orEmpty()) }
    var selectedEquipmentId by remember(initialDraft?.id) { mutableStateOf(initialDraft?.equipmentId.orEmpty()) }
    var selectedEquipmentName by remember(initialDraft?.id) { mutableStateOf(initialDraft?.equipmentName.orEmpty()) }
    var selectedEquipmentDisplay by remember(initialDraft?.id) { mutableStateOf(initialDraft?.equipmentDisplay.orEmpty()) }
    var selectedEquipmentBrand by remember(initialDraft?.id) { mutableStateOf(initialDraft?.equipmentBrand.orEmpty()) }
    var selectedEquipmentBtus by remember(initialDraft?.id) { mutableStateOf(initialDraft?.equipmentBtus.orEmpty()) }
    var selectedEquipmentSector by remember(initialDraft?.id) { mutableStateOf(initialDraft?.equipmentSector.orEmpty()) }

    // Campos Técnicos do Atendimento
    var description by remember(initialDraft?.id) { mutableStateOf(initialDraft?.description.orEmpty()) }
    var diagnosis by remember(initialDraft?.id) { mutableStateOf(initialDraft?.diagnosis.orEmpty()) }
    var solution by remember(initialDraft?.id) { mutableStateOf(initialDraft?.solution.orEmpty()) }
    var technicalReport by remember(initialDraft?.id) { mutableStateOf(initialDraft?.technicalReport.orEmpty()) }

    // Campos do Fiscal / Responsável
    var fiscalName by remember(initialDraft?.id) { mutableStateOf(initialDraft?.fiscalName.orEmpty()) }
    var fiscalRegistration by remember(initialDraft?.id) { mutableStateOf(initialDraft?.fiscalRegistration.orEmpty()) }
    var fiscalRole by remember(initialDraft?.id) { mutableStateOf(initialDraft?.fiscalRole.orEmpty()) }
    var fiscalContact by remember(initialDraft?.id) { mutableStateOf(initialDraft?.fiscalContact.orEmpty()) }
    val signaturePaths = remember(initialDraft?.id) { mutableStateListOf<SignaturePath>() }
    var hasSignature by remember(initialDraft?.id) { mutableStateOf(false) }

    // Fotos do Equipamento / Atendimento (até 4 imagens por O.S.)
    val maxPhotos = 4
    val attachedPhotoPaths = remember(initialDraft?.id) {
        mutableStateListOf<String>().apply {
            addAll(initialDraft?.photoPaths.orEmpty().filter { it.isNotBlank() && File(it).exists() })
        }
    }
    var isProcessingPhoto by remember { mutableStateOf(false) }
    var pendingCameraFile by remember { mutableStateOf<File?>(null) }
    var previewPhotoPath by remember { mutableStateOf<String?>(null) }
    val photoSessionId = remember(initialDraft?.id) { initialDraft?.id ?: "NEWOS_${System.currentTimeMillis()}" }
    val photoCaptureManager = remember(context) { PhotoCaptureManager(context) }
    val coroutineScope = rememberCoroutineScope()

    // Estados de UI e Validação
    var isSubmitting by remember { mutableStateOf(false) }
    var isSavingDraft by remember { mutableStateOf(false) }
    var validationError by remember { mutableStateOf<String?>(null) }
    var clientExpanded by remember { mutableStateOf(false) }
    var addressExpanded by remember { mutableStateOf(false) }
    var equipmentExpanded by remember { mutableStateOf(false) }

    val cameraLauncher = rememberLauncherForActivityResult(
        contract = ActivityResultContracts.TakePicture()
    ) { success ->
        val capturedFile = pendingCameraFile
        pendingCameraFile = null
        if (success && capturedFile != null && attachedPhotoPaths.size < maxPhotos) {
            isProcessingPhoto = true
            coroutineScope.launch {
                val compressed = withContext(Dispatchers.IO) {
                    photoCaptureManager.compressPhoto(capturedFile)
                }
                isProcessingPhoto = false
                if (compressed.exists() && compressed.length() > 0L && attachedPhotoPaths.size < maxPhotos) {
                    attachedPhotoPaths.add(compressed.absolutePath)
                    Toast.makeText(
                        context,
                        "Foto anexada (${attachedPhotoPaths.size}/$maxPhotos)",
                        Toast.LENGTH_SHORT
                    ).show()
                } else {
                    Toast.makeText(context, "Não foi possível processar a foto capturada.", Toast.LENGTH_SHORT).show()
                }
            }
        }
    }

    val galleryLauncher = rememberLauncherForActivityResult(
        contract = ActivityResultContracts.GetContent()
    ) { uri: Uri? ->
        if (uri != null && attachedPhotoPaths.size < maxPhotos) {
            isProcessingPhoto = true
            coroutineScope.launch {
                val savedFile = withContext(Dispatchers.IO) {
                    photoCaptureManager.saveGalleryImageUri(
                        sourceUri = uri,
                        orderId = photoSessionId,
                        equipmentId = "FOTO_${System.currentTimeMillis()}"
                    )
                }
                isProcessingPhoto = false
                if (savedFile != null && savedFile.exists() && attachedPhotoPaths.size < maxPhotos) {
                    attachedPhotoPaths.add(savedFile.absolutePath)
                    Toast.makeText(
                        context,
                        "Imagem anexada (${attachedPhotoPaths.size}/$maxPhotos)",
                        Toast.LENGTH_SHORT
                    ).show()
                } else {
                    Toast.makeText(context, "Não foi possível carregar a imagem selecionada.", Toast.LENGTH_SHORT).show()
                }
            }
        }
    }

    fun startCameraCapture() {
        try {
            if (attachedPhotoPaths.size >= maxPhotos) {
                Toast.makeText(context, "Limite máximo de $maxPhotos fotos por O.S. atingido.", Toast.LENGTH_SHORT).show()
                return
            }
            val (uri, file) = photoCaptureManager.createPhotoUri(
                orderId = photoSessionId,
                equipmentId = "FOTO_${System.currentTimeMillis()}"
            )
            pendingCameraFile = file
            cameraLauncher.launch(uri)
        } catch (t: Throwable) {
            Toast.makeText(context, "Erro ao abrir câmera: ${t.message ?: "Câmera indisponível"}", Toast.LENGTH_LONG).show()
        }
    }

    val cameraPermissionLauncher = rememberLauncherForActivityResult(
        contract = ActivityResultContracts.RequestPermission()
    ) { isGranted ->
        if (isGranted) {
            startCameraCapture()
        } else {
            Toast.makeText(
                context,
                "Permissão de câmera negada. Você pode selecionar imagens pela Galeria.",
                Toast.LENGTH_LONG
            ).show()
        }
    }

    fun launchCameraSafely() {
        if (attachedPhotoPaths.size >= maxPhotos) {
            Toast.makeText(context, "Limite máximo de $maxPhotos fotos por O.S. atingido.", Toast.LENGTH_SHORT).show()
            return
        }
        val permissionCheck = ContextCompat.checkSelfPermission(context, Manifest.permission.CAMERA)
        if (permissionCheck == PackageManager.PERMISSION_GRANTED) {
            startCameraCapture()
        } else {
            cameraPermissionLauncher.launch(Manifest.permission.CAMERA)
        }
    }

    fun launchGallerySafely() {
        if (attachedPhotoPaths.size >= maxPhotos) {
            Toast.makeText(context, "Limite máximo de $maxPhotos fotos por O.S. atingido.", Toast.LENGTH_SHORT).show()
            return
        }
        try {
            galleryLauncher.launch("image/*")
        } catch (t: Throwable) {
            Toast.makeText(context, "Não foi possível abrir a galeria.", Toast.LENGTH_SHORT).show()
        }
    }

    val filteredAddresses = remember(selectedClientId, uiState.addresses) {
        if (selectedClientId.isBlank()) {
            uiState.addresses
        } else {
            uiState.addresses.filter { it.clientId == selectedClientId }
        }
    }

    // Carrega equipamentos do endereço restaurado quando estiver continuando uma O.S. salva
    LaunchedEffect(initialDraft?.id) {
        val draftAddressId = initialDraft?.addressId.orEmpty()
        if (draftAddressId.isNotBlank()) {
            viewModel.loadEquipmentsForAddress(draftAddressId)
        }
    }

    // Auto-seleciona cliente quando houver apenas 1 programado no roteiro de hoje (apenas em nova O.S.)
    LaunchedEffect(uiState.clients, initialDraft?.id) {
        if (initialDraft == null && uiState.clients.size == 1 && selectedClientId.isBlank()) {
            selectedClientId = uiState.clients[0].id
            selectedClientName = uiState.clients[0].name
        }
    }

    // Auto-seleciona endereço quando houver apenas 1 para o cliente selecionado (apenas em nova O.S.)
    LaunchedEffect(filteredAddresses, initialDraft?.id) {
        if (initialDraft == null && filteredAddresses.size == 1 && selectedAddressId.isBlank()) {
            val addr = filteredAddresses[0]
            selectedAddressId = addr.id
            selectedAddressStreet = addr.street
            viewModel.loadEquipmentsForAddress(addr.id)
        }
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = {
                    Column {
                        Text(
                            text = if (initialDraft != null) "Continuar O.S. Salva" else "Nova Ordem de Serviço",
                            fontSize = 17.sp,
                            fontWeight = FontWeight.Black,
                            color = BluePrimary
                        )
                        Text(
                            text = if (initialDraft != null) {
                                "Salva no dispositivo • ${ServiceOrderDraftStorage.formatExpirationLabel(initialDraft)}"
                            } else {
                                "Abertura no Local de Atendimento • ${user.name}"
                            },
                            fontSize = 11.sp,
                            color = TextSecondary,
                            fontWeight = FontWeight.Medium
                        )
                    }
                },
                navigationIcon = {
                    IconButton(onClick = onBackClick) {
                        Icon(
                            imageVector = Icons.Default.ArrowBack,
                            contentDescription = "Voltar",
                            tint = BluePrimary
                        )
                    }
                },
                actions = {
                    TextButton(onClick = onBackClick) {
                        Text(
                            text = "Cancelar",
                            color = Color(0xFFDC2626),
                            fontWeight = FontWeight.Bold,
                            fontSize = 13.sp
                        )
                    }
                },
                colors = TopAppBarDefaults.topAppBarColors(containerColor = Color.White)
            )
        },
        bottomBar = {
            Surface(
                modifier = Modifier.fillMaxWidth(),
                shadowElevation = 8.dp,
                color = Color.White
            ) {
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(horizontal = 14.dp, vertical = 12.dp),
                    horizontalArrangement = Arrangement.spacedBy(10.dp)
                ) {
                    OutlinedButton(
                        onClick = {
                            val hasAnyContent = selectedClientName.isNotBlank() ||
                                selectedAddressStreet.isNotBlank() ||
                                selectedEquipmentName.isNotBlank() ||
                                description.isNotBlank() ||
                                diagnosis.isNotBlank() ||
                                solution.isNotBlank() ||
                                technicalReport.isNotBlank() ||
                                fiscalName.isNotBlank() ||
                                fiscalRegistration.isNotBlank() ||
                                fiscalRole.isNotBlank() ||
                                fiscalContact.isNotBlank() ||
                                attachedPhotoPaths.isNotEmpty()

                            if (!hasAnyContent) {
                                val msg = "Preencha ao menos um dado antes de salvar a O.S. no dispositivo."
                                validationError = msg
                                Toast.makeText(context, msg, Toast.LENGTH_SHORT).show()
                                return@OutlinedButton
                            }

                            isSavingDraft = true
                            validationError = null
                            viewModel.saveOrderDraft(
                                existingDraftId = currentDraftId,
                                clientId = selectedClientId,
                                clientName = selectedClientName,
                                addressId = selectedAddressId,
                                addressStreet = selectedAddressStreet,
                                equipmentId = selectedEquipmentId,
                                equipmentName = selectedEquipmentName,
                                equipmentDisplay = selectedEquipmentDisplay,
                                equipmentBrand = selectedEquipmentBrand,
                                equipmentBtus = selectedEquipmentBtus,
                                equipmentSector = selectedEquipmentSector,
                                description = description,
                                diagnosis = diagnosis,
                                solution = solution,
                                technicalReport = technicalReport,
                                fiscalName = fiscalName,
                                fiscalRegistration = fiscalRegistration,
                                fiscalRole = fiscalRole,
                                fiscalContact = fiscalContact,
                                photoPaths = attachedPhotoPaths.toList(),
                                onSaved = { savedDraft ->
                                    currentDraftId = savedDraft.id
                                    isSavingDraft = false
                                    Toast.makeText(
                                        context,
                                        "O.S. salva no dispositivo! Mantida por até ${ServiceOrderDraftStorage.RETENTION_DAYS} dias para continuar depois.",
                                        Toast.LENGTH_LONG
                                    ).show()
                                    onDraftSaved()
                                },
                                onError = { err ->
                                    isSavingDraft = false
                                    validationError = err
                                    Toast.makeText(context, err, Toast.LENGTH_LONG).show()
                                }
                            )
                        },
                        modifier = Modifier
                            .weight(1f)
                            .height(50.dp),
                        shape = RoundedCornerShape(12.dp),
                        border = BorderStroke(1.3.dp, BluePrimary),
                        colors = ButtonDefaults.outlinedButtonColors(
                            containerColor = Color(0xFFEFF6FF),
                            contentColor = BluePrimary
                        ),
                        contentPadding = PaddingValues(horizontal = 8.dp),
                        enabled = !isSubmitting && !isSavingDraft && !isProcessingPhoto
                    ) {
                        if (isSavingDraft) {
                            CircularProgressIndicator(
                                color = BluePrimary,
                                modifier = Modifier.size(18.dp),
                                strokeWidth = 2.dp
                            )
                        } else {
                            Icon(
                                imageVector = Icons.Default.Save,
                                contentDescription = null,
                                tint = BluePrimary,
                                modifier = Modifier.size(17.dp)
                            )
                            Spacer(modifier = Modifier.width(5.dp))
                            Text(
                                text = "SALVAR O.S.",
                                fontSize = 12.sp,
                                fontWeight = FontWeight.Black,
                                color = BluePrimary,
                                maxLines = 1
                            )
                        }
                    }

                    Button(
                        onClick = {
                            if (selectedClientName.isBlank()) {
                                validationError = "Por favor, selecione o Cliente com atendimento previsto hoje."
                                return@Button
                            }
                            if (selectedAddressStreet.isBlank()) {
                                validationError = "Por favor, selecione o Endereço do atendimento."
                                return@Button
                            }
                            if (selectedEquipmentName.isBlank()) {
                                validationError = "Por favor, selecione a Máquina atendida deste endereço."
                                return@Button
                            }
                            if (description.isBlank()) {
                                validationError = "Por favor, preencha a Descrição do chamado / problema."
                                return@Button
                            }
                            if (diagnosis.isBlank()) {
                                validationError = "Por favor, preencha o Diagnóstico técnico da máquina."
                                return@Button
                            }
                            if (solution.isBlank()) {
                                validationError = "Por favor, preencha a Solução aplicada."
                                return@Button
                            }
                            if (fiscalName.isBlank()) {
                                validationError = "Por favor, informe o Nome do fiscal / responsável."
                                return@Button
                            }
                            if (fiscalRegistration.isBlank()) {
                                validationError = "Por favor, informe a Matrícula do fiscal / responsável."
                                return@Button
                            }
                            if (!hasSignature || signaturePaths.isEmpty()) {
                                validationError = "Por favor, colha a Assinatura Digital do fiscal na tela."
                                return@Button
                            }

                            isSubmitting = true
                            validationError = null

                            // Salva a assinatura digital localmente em PNG e converte em Base64
                            val tempId = "OS_${System.currentTimeMillis()}"
                            val sigFile = try {
                                saveSignatureToLocalFile(
                                    context = context,
                                    paths = signaturePaths,
                                    orderId = tempId
                                )
                            } catch (e: Exception) {
                                null
                            }
                            val sigBase64 = sigFile?.let { fileToBase64(it) }

                            viewModel.createServiceOrder(
                                date = "",
                                type = "MANUTENÇÃO CORRETIVA CONTRATO",
                                clientId = selectedClientId.ifBlank { "CLI_ROTEIRO_${System.currentTimeMillis()}" },
                                clientName = selectedClientName,
                                addressId = selectedAddressId.ifBlank { "ADDR_ROTEIRO_${System.currentTimeMillis()}" },
                                addressStreet = selectedAddressStreet,
                                equipmentId = selectedEquipmentId.ifBlank { null },
                                equipmentName = selectedEquipmentName.ifBlank { null },
                                equipmentBrand = selectedEquipmentBrand.ifBlank { null },
                                equipmentBtus = selectedEquipmentBtus.ifBlank { null },
                                equipmentSector = selectedEquipmentSector.ifBlank { null },
                                tech2Name = null,
                                description = description,
                                diagnosis = diagnosis,
                                solution = solution,
                                technicalReport = technicalReport.trim().ifBlank { null },
                                fiscalName = fiscalName,
                                fiscalRegistration = fiscalRegistration,
                                fiscalRole = fiscalRole.trim().ifBlank { null },
                                fiscalContact = fiscalContact.trim().ifBlank { null },
                                signaturePath = sigFile?.absolutePath,
                                signatureBase64 = sigBase64,
                                photoPaths = attachedPhotoPaths.toList(),
                                isFinalized = true,
                                onSuccess = { createdId ->
                                    currentDraftId?.let { draftId ->
                                        viewModel.deleteOrderDraft(draftId)
                                    }
                                    isSubmitting = false
                                    Toast.makeText(
                                        context,
                                        "Ordem de Serviço criada e finalizada com sucesso com a assinatura do fiscal!",
                                        Toast.LENGTH_LONG
                                    ).show()
                                    onOrderCreated(createdId)
                                },
                                onError = { err ->
                                    isSubmitting = false
                                    validationError = err
                                    Toast.makeText(context, err, Toast.LENGTH_LONG).show()
                                }
                            )
                        },
                        modifier = Modifier
                            .weight(1.35f)
                            .height(50.dp),
                        shape = RoundedCornerShape(12.dp),
                        colors = ButtonDefaults.buttonColors(containerColor = Color(0xFF581C87)),
                        contentPadding = PaddingValues(horizontal = 10.dp),
                        enabled = !isSubmitting && !isSavingDraft && (uiState.clients.isNotEmpty() || selectedClientName.isNotBlank())
                    ) {
                        if (isSubmitting) {
                            CircularProgressIndicator(
                                color = Color.White,
                                modifier = Modifier.size(20.dp),
                                strokeWidth = 2.dp
                            )
                        } else {
                            Icon(Icons.Default.CheckCircle, contentDescription = null, modifier = Modifier.size(17.dp))
                            Spacer(modifier = Modifier.width(6.dp))
                            Text("FINALIZAR O.S.", fontSize = 12.sp, fontWeight = FontWeight.Black, maxLines = 1)
                        }
                    }
                }
            }
        },
        containerColor = Color(0xFFF8FAFC)
    ) { paddingValues ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(paddingValues)
                .verticalScroll(rememberScrollState())
                .padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(14.dp)
        ) {
            // Banner informativo superior
            Card(
                modifier = Modifier.fillMaxWidth(),
                shape = RoundedCornerShape(16.dp),
                colors = CardDefaults.cardColors(
                    containerColor = if (initialDraft != null) Color(0xFF1E3A8A) else Color(0xFF3B1578)
                )
            ) {
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(14.dp),
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Box(
                        modifier = Modifier
                            .size(40.dp)
                            .clip(RoundedCornerShape(12.dp))
                            .background(if (initialDraft != null) Color(0xFF1D4ED8) else Color(0xFF581C87)),
                        contentAlignment = Alignment.Center
                    ) {
                        Icon(
                            imageVector = if (initialDraft != null) Icons.Default.Save else Icons.Default.Build,
                            contentDescription = null,
                            tint = if (initialDraft != null) Color(0xFFBFDBFE) else Color(0xFFD8B4FE),
                            modifier = Modifier.size(22.dp)
                        )
                    }
                    Spacer(modifier = Modifier.width(12.dp))
                    Column {
                        Text(
                            text = if (initialDraft != null) "Continuando O.S. Salva no Dispositivo" else "Abertura de Ordem de Serviço",
                            fontWeight = FontWeight.Black,
                            fontSize = 14.sp,
                            color = Color.White
                        )
                        Text(
                            text = if (initialDraft != null) {
                                "Revise os dados preenchidos, atualize se necessário ou colha a assinatura para finalizar."
                            } else {
                                "Preencha a máquina e o serviço. Use 'SALVAR O.S.' para guardar no aparelho por até 7 dias ou finalize agora."
                            },
                            fontSize = 11.sp,
                            color = if (initialDraft != null) Color(0xFFDBEAFE) else Color(0xFFD8B4FE)
                        )
                    }
                }
            }

            // SEÇÃO 1: LOCAL DO ATENDIMENTO (CLIENTE, ENDEREÇO E MÁQUINA)
            Card(
                modifier = Modifier.fillMaxWidth(),
                shape = RoundedCornerShape(16.dp),
                colors = CardDefaults.cardColors(containerColor = Color.White),
                elevation = CardDefaults.cardElevation(defaultElevation = 1.dp)
            ) {
                Column(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(16.dp),
                    verticalArrangement = Arrangement.spacedBy(14.dp)
                ) {
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Text(
                            text = "1. Local do Atendimento e Máquina",
                            fontSize = 13.sp,
                            fontWeight = FontWeight.Black,
                            color = TextPrimary
                        )
                        Surface(
                            shape = RoundedCornerShape(8.dp),
                            color = Color(0xFFEFF6FF)
                        ) {
                            Text(
                                text = "${uiState.clients.size} cliente(s) no roteiro",
                                fontSize = 10.sp,
                                fontWeight = FontWeight.Bold,
                                color = BluePrimary,
                                modifier = Modifier.padding(horizontal = 8.dp, vertical = 4.dp)
                            )
                        }
                    }

                    if (uiState.clients.isEmpty() && selectedClientName.isBlank()) {
                        Surface(
                            modifier = Modifier.fillMaxWidth(),
                            shape = RoundedCornerShape(12.dp),
                            color = Color(0xFFFEF3C7),
                            border = androidx.compose.foundation.BorderStroke(1.dp, Color(0xFFFDE68A))
                        ) {
                            Row(
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .padding(12.dp),
                                verticalAlignment = Alignment.CenterVertically
                            ) {
                                Icon(
                                    Icons.Default.Info,
                                    contentDescription = null,
                                    tint = Color(0xFFB45309),
                                    modifier = Modifier.size(22.dp)
                                )
                                Spacer(modifier = Modifier.width(10.dp))
                                Text(
                                    text = "Nenhum atendimento programado no seu roteiro de hoje. Você só pode abrir novas O.S. nos clientes e endereços previstos pela administração.",
                                    fontSize = 11.sp,
                                    color = Color(0xFF92400E),
                                    lineHeight = 15.sp,
                                    fontWeight = FontWeight.Medium
                                )
                            }
                        }
                    } else {
                        // Campo 1: Escolher o Cliente
                        Column {
                            Text(
                                text = "CLIENTE *",
                                fontSize = 11.sp,
                                fontWeight = FontWeight.Bold,
                                color = TextSecondary
                            )
                            Spacer(modifier = Modifier.height(4.dp))
                            Box(modifier = Modifier.fillMaxWidth()) {
                                OutlinedTextField(
                                    value = selectedClientName.ifBlank { "Selecione o Cliente do Roteiro..." },
                                    onValueChange = {},
                                    readOnly = true,
                                    modifier = Modifier.fillMaxWidth(),
                                    shape = RoundedCornerShape(12.dp),
                                    leadingIcon = {
                                        Icon(Icons.Default.Business, contentDescription = null, tint = BluePrimary, modifier = Modifier.size(18.dp))
                                    },
                                    trailingIcon = {
                                        IconButton(onClick = { clientExpanded = !clientExpanded }) {
                                            Icon(Icons.Default.ArrowDropDown, contentDescription = null)
                                        }
                                    }
                                )
                                Box(
                                    modifier = Modifier
                                        .matchParentSize()
                                        .clickable { clientExpanded = true }
                                )
                                DropdownMenu(
                                    expanded = clientExpanded,
                                    onDismissRequest = { clientExpanded = false }
                                ) {
                                    uiState.clients.forEach { c ->
                                        DropdownMenuItem(
                                            text = {
                                                Column {
                                                    Text(c.name, fontSize = 13.sp, fontWeight = FontWeight.Bold)
                                                    c.document?.let { doc ->
                                                        Text("CNPJ: $doc", fontSize = 10.sp, color = TextSecondary)
                                                    }
                                                }
                                            },
                                            onClick = {
                                                selectedClientId = c.id
                                                selectedClientName = c.name
                                                selectedAddressId = ""
                                                selectedAddressStreet = ""
                                                selectedEquipmentId = ""
                                                selectedEquipmentName = ""
                                                selectedEquipmentDisplay = ""
                                                clientExpanded = false
                                            }
                                        )
                                    }
                                }
                            }
                        }

                        // Campo 2: Escolher o Endereço
                        Column {
                            Text(
                                text = "ENDEREÇO *",
                                fontSize = 11.sp,
                                fontWeight = FontWeight.Bold,
                                color = TextSecondary
                            )
                            Spacer(modifier = Modifier.height(4.dp))
                            Box(modifier = Modifier.fillMaxWidth()) {
                                OutlinedTextField(
                                    value = selectedAddressStreet.ifBlank {
                                        if (selectedClientId.isBlank()) "Selecione o Cliente primeiro..." else "Selecione o Endereço do Roteiro..."
                                    },
                                    onValueChange = {},
                                    readOnly = true,
                                    enabled = selectedClientId.isNotBlank(),
                                    modifier = Modifier.fillMaxWidth(),
                                    shape = RoundedCornerShape(12.dp),
                                    leadingIcon = {
                                        Icon(Icons.Default.LocationOn, contentDescription = null, tint = Color(0xFFDC2626), modifier = Modifier.size(18.dp))
                                    },
                                    trailingIcon = {
                                        IconButton(
                                            onClick = { if (selectedClientId.isNotBlank()) addressExpanded = !addressExpanded },
                                            enabled = selectedClientId.isNotBlank()
                                        ) {
                                            Icon(Icons.Default.ArrowDropDown, contentDescription = null)
                                        }
                                    }
                                )
                                if (selectedClientId.isNotBlank()) {
                                    Box(
                                        modifier = Modifier
                                            .matchParentSize()
                                            .clickable { addressExpanded = true }
                                    )
                                }
                                DropdownMenu(
                                    expanded = addressExpanded,
                                    onDismissRequest = { addressExpanded = false }
                                ) {
                                    if (filteredAddresses.isEmpty()) {
                                        DropdownMenuItem(
                                            text = { Text("Nenhum endereço previsto para este cliente hoje", fontSize = 12.sp) },
                                            onClick = { addressExpanded = false }
                                        )
                                    } else {
                                        filteredAddresses.forEach { a ->
                                            DropdownMenuItem(
                                                text = { Text(a.street, fontSize = 12.sp, fontWeight = FontWeight.SemiBold) },
                                                onClick = {
                                                    selectedAddressId = a.id
                                                    selectedAddressStreet = a.street
                                                    selectedEquipmentId = ""
                                                    selectedEquipmentName = ""
                                                    selectedEquipmentDisplay = ""
                                                    viewModel.loadEquipmentsForAddress(a.id)
                                                    addressExpanded = false
                                                }
                                            )
                                        }
                                    }
                                }
                            }
                        }

                        // Campo 3: Selecionar a Máquina do determinado endereço
                        Column {
                            Row(
                                modifier = Modifier.fillMaxWidth(),
                                horizontalArrangement = Arrangement.SpaceBetween,
                                verticalAlignment = Alignment.CenterVertically
                            ) {
                                Text(
                                    text = "MÁQUINA / EQUIPAMENTO *",
                                    fontSize = 11.sp,
                                    fontWeight = FontWeight.Bold,
                                    color = TextSecondary,
                                    modifier = Modifier.weight(1f)
                                )
                                if (uiState.isLoadingEquipments) {
                                    Row(verticalAlignment = Alignment.CenterVertically) {
                                        CircularProgressIndicator(
                                            modifier = Modifier.size(12.dp),
                                            strokeWidth = 1.5.dp,
                                            color = BluePrimary
                                        )
                                        Spacer(modifier = Modifier.width(4.dp))
                                        Text("Carregando...", fontSize = 10.sp, color = BluePrimary, maxLines = 1)
                                    }
                                } else if (selectedAddressId.isNotBlank()) {
                                    Text(
                                        text = "${uiState.equipments.size} encontrada(s)",
                                        fontSize = 10.sp,
                                        color = Color(0xFF059669),
                                        fontWeight = FontWeight.Bold,
                                        maxLines = 1,
                                        softWrap = false
                                    )
                                }
                            }
                            Spacer(modifier = Modifier.height(4.dp))
                            Box(modifier = Modifier.fillMaxWidth()) {
                                OutlinedTextField(
                                    value = selectedEquipmentDisplay.ifBlank {
                                        selectedEquipmentName.ifBlank {
                                            if (selectedAddressId.isBlank()) "Selecione o Endereço primeiro..." else "Selecione a máquina deste endereço..."
                                        }
                                    },
                                    onValueChange = {},
                                    readOnly = true,
                                    enabled = selectedAddressId.isNotBlank(),
                                    maxLines = 2,
                                    modifier = Modifier.fillMaxWidth(),
                                    shape = RoundedCornerShape(12.dp),
                                    leadingIcon = {
                                        Icon(Icons.Default.Settings, contentDescription = null, tint = BluePrimary, modifier = Modifier.size(18.dp))
                                    },
                                    trailingIcon = {
                                        IconButton(
                                            onClick = { if (selectedAddressId.isNotBlank()) equipmentExpanded = !equipmentExpanded },
                                            enabled = selectedAddressId.isNotBlank()
                                        ) {
                                            Icon(Icons.Default.ArrowDropDown, contentDescription = null)
                                        }
                                    }
                                )
                                if (selectedAddressId.isNotBlank()) {
                                    Box(
                                        modifier = Modifier
                                            .matchParentSize()
                                            .clickable { equipmentExpanded = true }
                                    )
                                }
                                DropdownMenu(
                                    expanded = equipmentExpanded,
                                    onDismissRequest = { equipmentExpanded = false }
                                ) {
                                    // Lista de máquinas reais daquele endereço
                                    if (uiState.equipments.isNotEmpty()) {
                                        uiState.equipments.forEach { eq ->
                                            val sectorStr = eq.sector?.trim()?.takeIf { it.isNotBlank() }
                                            val brandStr = eq.brand?.trim()?.takeIf { it.isNotBlank() }
                                            val btuStr = eq.btu?.trim()?.takeIf { it.isNotBlank() }?.let { raw ->
                                                if (raw.contains("BTU", ignoreCase = true)) raw else "$raw BTUs"
                                            }
                                            val primarySummary = listOfNotNull(sectorStr, brandStr, btuStr)
                                                .joinToString(" • ")
                                                .uppercase(Locale.getDefault())
                                            val displayLabel = primarySummary.ifBlank {
                                                eq.name.uppercase(Locale.getDefault())
                                            }

                                            DropdownMenuItem(
                                                text = {
                                                    Column {
                                                        Text(
                                                            text = displayLabel,
                                                            fontSize = 12.sp,
                                                            fontWeight = FontWeight.Bold,
                                                            color = TextPrimary
                                                        )
                                                        if (primarySummary.isNotBlank() && eq.name.isNotBlank()) {
                                                            Text(
                                                                text = eq.name.uppercase(Locale.getDefault()),
                                                                fontSize = 10.sp,
                                                                color = TextSecondary
                                                            )
                                                        }
                                                    }
                                                },
                                                onClick = {
                                                    selectedEquipmentId = eq.id
                                                    selectedEquipmentName = eq.name
                                                    selectedEquipmentDisplay = displayLabel
                                                    selectedEquipmentBrand = eq.brand?.trim().orEmpty()
                                                    selectedEquipmentBtus = eq.btu?.trim().orEmpty()
                                                    selectedEquipmentSector = eq.sector?.trim().orEmpty()
                                                    equipmentExpanded = false
                                                }
                                            )
                                        }
                                        HorizontalDivider(modifier = Modifier.padding(vertical = 4.dp))
                                    }

                                    // Opção para equipamento avulso / adicional
                                    DropdownMenuItem(
                                        text = {
                                            Column {
                                                Text(
                                                    text = "OUTRO EQUIPAMENTO (Avulso / Não listado)",
                                                    fontSize = 12.sp,
                                                    fontWeight = FontWeight.Bold,
                                                    color = Color(0xFF6B21A8)
                                                )
                                                Text(
                                                    text = "Selecione caso a máquina não esteja no cadastro",
                                                    fontSize = 10.sp,
                                                    color = TextSecondary
                                                )
                                            }
                                        },
                                        onClick = {
                                            selectedEquipmentId = "OUTRO_EQUIPAMENTO"
                                            selectedEquipmentName = "OUTRO EQUIPAMENTO (Avulso)"
                                            selectedEquipmentDisplay = "OUTRO EQUIPAMENTO (AVULSO)"
                                            selectedEquipmentBrand = ""
                                            selectedEquipmentBtus = ""
                                            selectedEquipmentSector = ""
                                            equipmentExpanded = false
                                        }
                                    )
                                }
                            }
                        }
                    }
                }
            }

            // SEÇÃO 2: DETALHES TÉCNICOS (DESCRIÇÃO, DIAGNÓSTICO E SOLUÇÃO)
            Card(
                modifier = Modifier.fillMaxWidth(),
                shape = RoundedCornerShape(16.dp),
                colors = CardDefaults.cardColors(containerColor = Color.White),
                elevation = CardDefaults.cardElevation(defaultElevation = 1.dp)
            ) {
                Column(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(16.dp),
                    verticalArrangement = Arrangement.spacedBy(14.dp)
                ) {
                    Text(
                        text = "2. Laudo e Execução Técnica",
                        fontSize = 13.sp,
                        fontWeight = FontWeight.Black,
                        color = TextPrimary
                    )

                    // Campo: Descrição do Problema / Chamado
                    Column {
                        Text(
                            text = "DESCRIÇÃO DO CHAMADO / PROBLEMA *",
                            fontSize = 11.sp,
                            fontWeight = FontWeight.Bold,
                            color = TextSecondary
                        )
                        Spacer(modifier = Modifier.height(4.dp))
                        OutlinedTextField(
                            value = description,
                            onValueChange = { description = it.uppercase(Locale.getDefault()) },
                            modifier = Modifier
                                .fillMaxWidth()
                                .height(85.dp),
                            shape = RoundedCornerShape(12.dp),
                            keyboardOptions = KeyboardOptions(capitalization = KeyboardCapitalization.Characters),
                            placeholder = {
                                Text(
                                    "Descreva o problema relatado pelo cliente ou motivo do chamado...",
                                    fontSize = 11.sp
                                )
                            }
                        )
                    }

                    // Campo: Diagnóstico da Máquina
                    Column {
                        Text(
                            text = "DIAGNÓSTICO DA MÁQUINA *",
                            fontSize = 11.sp,
                            fontWeight = FontWeight.Bold,
                            color = TextSecondary
                        )
                        Spacer(modifier = Modifier.height(4.dp))
                        OutlinedTextField(
                            value = diagnosis,
                            onValueChange = { diagnosis = it.uppercase(Locale.getDefault()) },
                            modifier = Modifier
                                .fillMaxWidth()
                                .height(85.dp),
                            shape = RoundedCornerShape(12.dp),
                            keyboardOptions = KeyboardOptions(capitalization = KeyboardCapitalization.Characters),
                            placeholder = {
                                Text(
                                    "Diagnóstico técnico da máquina, testes realizados, defeito encontrado...",
                                    fontSize = 11.sp
                                )
                            }
                        )
                    }

                    // Campo: Solução Aplicada
                    Column {
                        Text(
                            text = "SOLUÇÃO APLICADA *",
                            fontSize = 11.sp,
                            fontWeight = FontWeight.Bold,
                            color = TextSecondary
                        )
                        Spacer(modifier = Modifier.height(4.dp))
                        OutlinedTextField(
                            value = solution,
                            onValueChange = { solution = it.uppercase(Locale.getDefault()) },
                            modifier = Modifier
                                .fillMaxWidth()
                                .height(85.dp),
                            shape = RoundedCornerShape(12.dp),
                            keyboardOptions = KeyboardOptions(capitalization = KeyboardCapitalization.Characters),
                            placeholder = {
                                Text(
                                    "Solução aplicada, peças trocadas, higienização, reparo e testes de rendimento...",
                                    fontSize = 11.sp
                                )
                            }
                        )
                    }
                }
            }

            // SEÇÃO DE FOTOS DO EQUIPAMENTO / ATENDIMENTO (ATÉ 4 IMAGENS POR O.S.)
            Card(
                modifier = Modifier.fillMaxWidth(),
                shape = RoundedCornerShape(16.dp),
                colors = CardDefaults.cardColors(containerColor = Color.White),
                elevation = CardDefaults.cardElevation(defaultElevation = 1.dp)
            ) {
                Column(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(16.dp),
                    verticalArrangement = Arrangement.spacedBy(12.dp)
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
                            Box(
                                modifier = Modifier
                                    .size(30.dp)
                                    .clip(RoundedCornerShape(8.dp))
                                    .background(BluePrimary.copy(alpha = 0.12f)),
                                contentAlignment = Alignment.Center
                            ) {
                                Icon(
                                    imageVector = Icons.Default.PhotoCamera,
                                    contentDescription = null,
                                    tint = BluePrimary,
                                    modifier = Modifier.size(17.dp)
                                )
                            }
                            Spacer(modifier = Modifier.width(10.dp))
                            Column {
                                Text(
                                    text = "FOTOS DO EQUIPAMENTO",
                                    fontSize = 13.sp,
                                    fontWeight = FontWeight.Black,
                                    color = TextPrimary
                                )
                                Text(
                                    text = "Anexe fotos da máquina ou do serviço realizado (até $maxPhotos fotos)",
                                    fontSize = 10.sp,
                                    color = TextSecondary
                                )
                            }
                        }

                        Surface(
                            shape = RoundedCornerShape(8.dp),
                            color = if (attachedPhotoPaths.size >= maxPhotos) Color(0xFFDCFCE7) else Color(0xFFEFF6FF)
                        ) {
                            Text(
                                text = "${attachedPhotoPaths.size}/$maxPhotos",
                                fontSize = 11.sp,
                                fontWeight = FontWeight.Black,
                                color = if (attachedPhotoPaths.size >= maxPhotos) Color(0xFF15803D) else BluePrimary,
                                modifier = Modifier.padding(horizontal = 8.dp, vertical = 4.dp)
                            )
                        }
                    }

                    if (attachedPhotoPaths.isNotEmpty()) {
                        LazyRow(
                            horizontalArrangement = Arrangement.spacedBy(10.dp),
                            modifier = Modifier.fillMaxWidth()
                        ) {
                            items(attachedPhotoPaths) { photoPath ->
                                Box(
                                    modifier = Modifier
                                        .size(84.dp)
                                        .clip(RoundedCornerShape(10.dp))
                                        .background(Color(0xFFE2E8F0))
                                        .border(1.dp, Color(0xFFCBD5E1), RoundedCornerShape(10.dp))
                                        .clickable { previewPhotoPath = photoPath }
                                ) {
                                    AsyncImage(
                                        model = File(photoPath),
                                        contentDescription = "Foto do equipamento",
                                        modifier = Modifier.fillMaxSize(),
                                        contentScale = ContentScale.Crop
                                    )
                                    Box(
                                        modifier = Modifier
                                            .align(Alignment.TopEnd)
                                            .padding(4.dp)
                                            .size(22.dp)
                                            .clip(CircleShape)
                                            .background(Color.Black.copy(alpha = 0.72f))
                                            .clickable { attachedPhotoPaths.remove(photoPath) },
                                        contentAlignment = Alignment.Center
                                    ) {
                                        Icon(
                                            imageVector = Icons.Default.Close,
                                            contentDescription = "Remover foto",
                                            tint = Color.White,
                                            modifier = Modifier.size(13.dp)
                                        )
                                    }
                                }
                            }
                        }
                    }

                    if (isProcessingPhoto) {
                        Row(
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.spacedBy(8.dp)
                        ) {
                            CircularProgressIndicator(
                                modifier = Modifier.size(16.dp),
                                strokeWidth = 2.dp,
                                color = BluePrimary
                            )
                            Text(
                                text = "Otimizando e anexando imagem...",
                                fontSize = 11.sp,
                                fontWeight = FontWeight.SemiBold,
                                color = BluePrimary
                            )
                        }
                    }

                    if (attachedPhotoPaths.size < maxPhotos) {
                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.spacedBy(10.dp)
                        ) {
                            Button(
                                onClick = { launchCameraSafely() },
                                enabled = !isSubmitting && !isProcessingPhoto,
                                modifier = Modifier
                                    .weight(1f)
                                    .height(44.dp),
                                shape = RoundedCornerShape(12.dp),
                                colors = ButtonDefaults.buttonColors(containerColor = BluePrimary)
                            ) {
                                Icon(
                                    imageVector = Icons.Default.PhotoCamera,
                                    contentDescription = null,
                                    modifier = Modifier.size(17.dp)
                                )
                                Spacer(modifier = Modifier.width(6.dp))
                                Text(
                                    text = "TIRAR FOTO",
                                    fontSize = 11.sp,
                                    fontWeight = FontWeight.Black
                                )
                            }

                            OutlinedButton(
                                onClick = { launchGallerySafely() },
                                enabled = !isSubmitting && !isProcessingPhoto,
                                modifier = Modifier
                                    .weight(1f)
                                    .height(44.dp),
                                shape = RoundedCornerShape(12.dp),
                                border = BorderStroke(1.dp, BluePrimary.copy(alpha = 0.4f))
                            ) {
                                Icon(
                                    imageVector = Icons.Default.PhotoLibrary,
                                    contentDescription = null,
                                    tint = BluePrimary,
                                    modifier = Modifier.size(17.dp)
                                )
                                Spacer(modifier = Modifier.width(6.dp))
                                Text(
                                    text = "GALERIA",
                                    fontSize = 11.sp,
                                    fontWeight = FontWeight.Black,
                                    color = BluePrimary
                                )
                            }
                        }
                    } else {
                        Surface(
                            modifier = Modifier.fillMaxWidth(),
                            shape = RoundedCornerShape(10.dp),
                            color = Color(0xFFECFDF5),
                            border = BorderStroke(1.dp, Color(0xFFA7F3D0))
                        ) {
                            Row(
                                modifier = Modifier.padding(horizontal = 12.dp, vertical = 8.dp),
                                verticalAlignment = Alignment.CenterVertically
                            ) {
                                Icon(
                                    imageVector = Icons.Default.CheckCircle,
                                    contentDescription = null,
                                    tint = Color(0xFF059669),
                                    modifier = Modifier.size(16.dp)
                                )
                                Spacer(modifier = Modifier.width(8.dp))
                                Text(
                                    text = "Limite de $maxPhotos fotos atingido. Toque no X de uma imagem para trocar.",
                                    fontSize = 11.sp,
                                    fontWeight = FontWeight.SemiBold,
                                    color = Color(0xFF065F46)
                                )
                            }
                        }
                    }
                }
            }

            // SEÇÃO DE OBSERVAÇÃO INTERNA (COMUNICAÇÃO ENTRE SETORES — NÃO EXIBIDA NA IMPRESSÃO DA O.S.)
            Card(
                modifier = Modifier.fillMaxWidth(),
                shape = RoundedCornerShape(16.dp),
                colors = CardDefaults.cardColors(containerColor = Color.White),
                elevation = CardDefaults.cardElevation(defaultElevation = 1.dp)
            ) {
                Column(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(16.dp),
                    verticalArrangement = Arrangement.spacedBy(10.dp)
                ) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Box(
                            modifier = Modifier
                                .size(30.dp)
                                .clip(RoundedCornerShape(8.dp))
                                .background(Color(0xFFF59E0B).copy(alpha = 0.14f)),
                            contentAlignment = Alignment.Center
                        ) {
                            Icon(
                                imageVector = Icons.Default.Description,
                                contentDescription = null,
                                tint = Color(0xFFB45309),
                                modifier = Modifier.size(17.dp)
                            )
                        }
                        Spacer(modifier = Modifier.width(10.dp))
                        Column {
                            Text(
                                text = "OBSERVAÇÃO INTERNA",
                                fontSize = 13.sp,
                                fontWeight = FontWeight.Black,
                                color = TextPrimary
                            )
                            Text(
                                text = "Comunicação interna entre setores (não exibida na folha de impressão da O.S.)",
                                fontSize = 10.sp,
                                color = TextSecondary
                            )
                        }
                    }

                    OutlinedTextField(
                        value = technicalReport,
                        onValueChange = { technicalReport = it.uppercase(Locale.getDefault()) },
                        modifier = Modifier
                            .fillMaxWidth()
                            .heightIn(min = 96.dp),
                        shape = RoundedCornerShape(12.dp),
                        keyboardOptions = KeyboardOptions(capitalization = KeyboardCapitalization.Characters),
                        minLines = 3,
                        maxLines = 6,
                        placeholder = {
                            Text(
                                "Anote observações internas para o administrativo ou outros setores sobre esta O.S. (não sai na impressão)...",
                                fontSize = 11.sp
                            )
                        }
                    )
                }
            }

            // SEÇÃO 3: FISCAL / RESPONSÁVEL DO CLIENTE E ASSINATURA DIGITAL
            Card(
                modifier = Modifier.fillMaxWidth(),
                shape = RoundedCornerShape(16.dp),
                colors = CardDefaults.cardColors(containerColor = Color.White),
                elevation = CardDefaults.cardElevation(defaultElevation = 1.dp)
            ) {
                Column(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(16.dp),
                    verticalArrangement = Arrangement.spacedBy(14.dp)
                ) {
                    Text(
                        text = "3. Fiscal / Responsável do Cliente",
                        fontSize = 13.sp,
                        fontWeight = FontWeight.Black,
                        color = TextPrimary
                    )

                    // Nome do Responsável (Fiscal)
                    Column {
                        Text(
                            text = "NOME DO RESPONSÁVEL (FISCAL) *",
                            fontSize = 11.sp,
                            fontWeight = FontWeight.Bold,
                            color = TextSecondary
                        )
                        Spacer(modifier = Modifier.height(4.dp))
                        OutlinedTextField(
                            value = fiscalName,
                            onValueChange = { fiscalName = it.uppercase(Locale.getDefault()) },
                            modifier = Modifier.fillMaxWidth(),
                            shape = RoundedCornerShape(12.dp),
                            keyboardOptions = KeyboardOptions(capitalization = KeyboardCapitalization.Characters),
                            leadingIcon = {
                                Icon(Icons.Default.Person, contentDescription = null, tint = BluePrimary, modifier = Modifier.size(18.dp))
                            },
                            placeholder = {
                                Text("Nome completo do fiscal que assina a ordem", fontSize = 11.sp)
                            },
                            singleLine = true
                        )
                    }

                    // Matrícula do Fiscal
                    Column {
                        Text(
                            text = "MATRÍCULA DO RESPONSÁVEL *",
                            fontSize = 11.sp,
                            fontWeight = FontWeight.Bold,
                            color = TextSecondary
                        )
                        Spacer(modifier = Modifier.height(4.dp))
                        OutlinedTextField(
                            value = fiscalRegistration,
                            onValueChange = { fiscalRegistration = it.uppercase(Locale.getDefault()) },
                            modifier = Modifier.fillMaxWidth(),
                            shape = RoundedCornerShape(12.dp),
                            keyboardOptions = KeyboardOptions(capitalization = KeyboardCapitalization.Characters),
                            leadingIcon = {
                                Icon(Icons.Default.AccountBox, contentDescription = null, tint = BluePrimary, modifier = Modifier.size(18.dp))
                            },
                            placeholder = {
                                Text("Matrícula funcional ou documento do fiscal", fontSize = 11.sp)
                            },
                            singleLine = true
                        )
                    }

                    // Função do Fiscal
                    Column {
                        Text(
                            text = "FUNÇÃO",
                            fontSize = 11.sp,
                            fontWeight = FontWeight.Bold,
                            color = TextSecondary
                        )
                        Spacer(modifier = Modifier.height(4.dp))
                        OutlinedTextField(
                            value = fiscalRole,
                            onValueChange = { fiscalRole = it.uppercase(Locale.getDefault()) },
                            modifier = Modifier.fillMaxWidth(),
                            shape = RoundedCornerShape(12.dp),
                            keyboardOptions = KeyboardOptions(capitalization = KeyboardCapitalization.Characters),
                            leadingIcon = {
                                Icon(Icons.Default.Badge, contentDescription = null, tint = BluePrimary, modifier = Modifier.size(18.dp))
                            },
                            placeholder = {
                                Text("Cargo ou função do responsável / fiscal", fontSize = 11.sp)
                            },
                            singleLine = true
                        )
                    }

                    // E-mail / Contato do Fiscal
                    Column {
                        Text(
                            text = "E-MAIL / CONTATO",
                            fontSize = 11.sp,
                            fontWeight = FontWeight.Bold,
                            color = TextSecondary
                        )
                        Spacer(modifier = Modifier.height(4.dp))
                        OutlinedTextField(
                            value = fiscalContact,
                            onValueChange = { fiscalContact = it.uppercase(Locale.getDefault()) },
                            modifier = Modifier.fillMaxWidth(),
                            shape = RoundedCornerShape(12.dp),
                            keyboardOptions = KeyboardOptions(capitalization = KeyboardCapitalization.Characters),
                            leadingIcon = {
                                Icon(Icons.Default.Email, contentDescription = null, tint = BluePrimary, modifier = Modifier.size(18.dp))
                            },
                            placeholder = {
                                Text("E-mail ou telefone de contato do fiscal", fontSize = 11.sp)
                            },
                            singleLine = true
                        )
                    }

                    // Assinatura Digital do Fiscal
                    Column {
                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.SpaceBetween,
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            Text(
                                text = "ASSINATURA DIGITAL DO FISCAL *",
                                fontSize = 11.sp,
                                fontWeight = FontWeight.Bold,
                                color = TextSecondary
                            )
                            if (hasSignature) {
                                Row(verticalAlignment = Alignment.CenterVertically) {
                                    Icon(
                                        Icons.Default.CheckCircle,
                                        contentDescription = null,
                                        tint = Color(0xFF059669),
                                        modifier = Modifier.size(14.dp)
                                    )
                                    Spacer(modifier = Modifier.width(4.dp))
                                    Text(
                                        text = "Assinatura Coletada",
                                        fontSize = 11.sp,
                                        fontWeight = FontWeight.Bold,
                                        color = Color(0xFF059669)
                                    )
                                }
                            }
                        }
                        Spacer(modifier = Modifier.height(6.dp))

                        SignaturePad(
                            modifier = Modifier
                                .fillMaxWidth()
                                .height(190.dp),
                            paths = signaturePaths,
                            onSignatureChanged = { signed ->
                                hasSignature = signed
                            }
                        )
                    }

                    // Mensagem de Erro de Validação
                    validationError?.let { err ->
                        Surface(
                            modifier = Modifier.fillMaxWidth(),
                            shape = RoundedCornerShape(10.dp),
                            color = Color(0xFFFEE2E2),
                            border = androidx.compose.foundation.BorderStroke(1.dp, Color(0xFFFCA5A5))
                        ) {
                            Row(
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .padding(10.dp),
                                verticalAlignment = Alignment.CenterVertically
                            ) {
                                Icon(
                                    Icons.Default.Warning,
                                    contentDescription = null,
                                    tint = Color(0xFFDC2626),
                                    modifier = Modifier.size(18.dp)
                                )
                                Spacer(modifier = Modifier.width(8.dp))
                                Text(
                                    text = err,
                                    color = Color(0xFF991B1B),
                                    fontSize = 11.sp,
                                    fontWeight = FontWeight.Bold
                                )
                            }
                        }
                    }
                }
            }

            Spacer(modifier = Modifier.height(16.dp))
        }
    }

    // Visualização ampliada ao tocar em uma miniatura
    previewPhotoPath?.let { photoPath ->
        Dialog(onDismissRequest = { previewPhotoPath = null }) {
            Card(
                shape = RoundedCornerShape(16.dp),
                colors = CardDefaults.cardColors(containerColor = Color.Black)
            ) {
                Box(
                    modifier = Modifier
                        .fillMaxWidth()
                        .heightIn(max = 460.dp)
                ) {
                    AsyncImage(
                        model = File(photoPath),
                        contentDescription = "Visualização da foto",
                        modifier = Modifier.fillMaxWidth(),
                        contentScale = ContentScale.Fit
                    )
                    IconButton(
                        onClick = { previewPhotoPath = null },
                        modifier = Modifier
                            .align(Alignment.TopEnd)
                            .padding(8.dp)
                            .clip(CircleShape)
                            .background(Color.Black.copy(alpha = 0.65f))
                    ) {
                        Icon(
                            imageVector = Icons.Default.Close,
                            contentDescription = "Fechar",
                            tint = Color.White
                        )
                    }
                }
            }
        }
    }
}

