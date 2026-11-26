package com.lefrio.atendimento.ui.serviceorders

import android.widget.Toast
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
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
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardCapitalization
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.lefrio.atendimento.data.auth.TechnicianUser
import com.lefrio.atendimento.data.local.LocalServiceOrderDraft
import com.lefrio.atendimento.data.local.entity.ServiceOrderEntity
import com.lefrio.atendimento.ui.signature.components.SignaturePad
import com.lefrio.atendimento.ui.signature.components.SignaturePath
import com.lefrio.atendimento.ui.signature.components.convertFileToBase64
import com.lefrio.atendimento.ui.signature.components.saveSignatureToLocalFile
import com.lefrio.atendimento.ui.theme.BluePrimary
import com.lefrio.atendimento.ui.theme.TextPrimary
import com.lefrio.atendimento.ui.theme.TextSecondary
import com.lefrio.atendimento.util.GpsAuditManager
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import java.util.Locale

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun BatchSignatureScreen(
    user: TechnicianUser,
    viewModel: ServiceOrdersViewModel,
    drafts: List<LocalServiceOrderDraft>,
    openOrders: List<ServiceOrderEntity>,
    onBackClick: () -> Unit,
    onBatchFinished: (totalFinalized: Int) -> Unit
) {
    val context = LocalContext.current
    val coroutineScope = rememberCoroutineScope()
    val gpsManager = remember(context) { GpsAuditManager(context) }

    val totalSelected = drafts.size + openOrders.size
    val batchClientName = remember(drafts, openOrders) {
        drafts.firstOrNull { it.clientName.isNotBlank() }?.clientName
            ?: openOrders.firstOrNull { it.clientName.isNotBlank() }?.clientName
            ?: "Cliente"
    }
    val batchAddressStreet = remember(drafts, openOrders) {
        drafts.firstOrNull { it.addressStreet.isNotBlank() }?.addressStreet
            ?: openOrders.firstOrNull { it.addressStreet.isNotBlank() }?.addressStreet
            ?: "Endereço do Atendimento"
    }

    // Pré-preenche dados do fiscal se já tiverem sido informados em algum dos rascunhos/O.S. do lote
    var fiscalName by remember {
        mutableStateOf(
            drafts.firstOrNull { it.fiscalName.isNotBlank() }?.fiscalName
                ?: openOrders.firstOrNull { !it.clientRepresentative.isNullOrBlank() }?.clientRepresentative.orEmpty()
        )
    }
    var fiscalRegistration by remember {
        mutableStateOf(
            drafts.firstOrNull { it.fiscalRegistration.isNotBlank() }?.fiscalRegistration
                ?: openOrders.firstOrNull { !it.clientSigneeDoc.isNullOrBlank() }?.clientSigneeDoc.orEmpty()
        )
    }
    var fiscalRole by remember {
        mutableStateOf(drafts.firstOrNull { it.fiscalRole.isNotBlank() }?.fiscalRole.orEmpty())
    }
    var fiscalContact by remember {
        mutableStateOf(drafts.firstOrNull { it.fiscalContact.isNotBlank() }?.fiscalContact.orEmpty())
    }

    val signaturePaths = remember { mutableStateListOf<SignaturePath>() }
    var hasSignature by remember { mutableStateOf(false) }

    var isItemsExpanded by remember { mutableStateOf(true) }
    var isSubmitting by remember { mutableStateOf(false) }
    var progressDone by remember { mutableIntStateOf(0) }
    var validationError by remember { mutableStateOf<String?>(null) }

    // Pré-aquecimento de GPS para auditoria ágil na assinatura
    var capturedLat by remember { mutableDoubleStateOf(0.0) }
    var capturedLng by remember { mutableDoubleStateOf(0.0) }
    var capturedAcc by remember { mutableFloatStateOf(0f) }

    LaunchedEffect(Unit) {
        try {
            val loc = withContext(Dispatchers.IO) { gpsManager.getCurrentLocation() }
            if (loc.isCaptured) {
                capturedLat = loc.latitude
                capturedLng = loc.longitude
                capturedAcc = loc.accuracy
            }
        } catch (_: Exception) {}
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = {
                    Column {
                        Text(
                            text = "Assinatura em Lote",
                            fontSize = 17.sp,
                            fontWeight = FontWeight.Black,
                            color = BluePrimary
                        )
                        Text(
                            text = "$totalSelected ${if (totalSelected == 1) "Ordem de Serviço" else "Ordens de Serviço"} • ${user.name}",
                            fontSize = 11.sp,
                            color = TextSecondary,
                            fontWeight = FontWeight.Medium,
                            maxLines = 1,
                            overflow = TextOverflow.Ellipsis
                        )
                    }
                },
                navigationIcon = {
                    IconButton(onClick = { if (!isSubmitting) onBackClick() }) {
                        Icon(
                            imageVector = Icons.Default.ArrowBack,
                            contentDescription = "Voltar",
                            tint = BluePrimary
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
                        onClick = onBackClick,
                        modifier = Modifier
                            .weight(0.75f)
                            .height(52.dp),
                        shape = RoundedCornerShape(12.dp),
                        enabled = !isSubmitting
                    ) {
                        Text(
                            text = "VOLTAR",
                            fontSize = 12.sp,
                            fontWeight = FontWeight.Bold,
                            color = TextSecondary,
                            maxLines = 1
                        )
                    }

                    Button(
                        onClick = {
                            if (totalSelected == 0) {
                                validationError = "Nenhuma Ordem de Serviço selecionada para o lote."
                                return@Button
                            }
                            if (fiscalName.isBlank()) {
                                validationError = "Informe o Nome do Responsável / Fiscal que está assinando o lote."
                                return@Button
                            }
                            if (fiscalRegistration.isBlank()) {
                                validationError = "Informe a Matrícula / Documento do Responsável / Fiscal."
                                return@Button
                            }
                            if (!hasSignature || signaturePaths.isEmpty()) {
                                validationError = "Colha a Assinatura Digital única do fiscal na tela antes de finalizar."
                                return@Button
                            }

                            isSubmitting = true
                            progressDone = 0
                            validationError = null

                            coroutineScope.launch {
                                try {
                                    // Garante captura de GPS se ainda não obtida
                                    var lat = capturedLat
                                    var lng = capturedLng
                                    var acc = capturedAcc
                                    if (lat == 0.0 && lng == 0.0) {
                                        val freshLoc = withContext(Dispatchers.IO) {
                                            try { gpsManager.getCurrentLocation() } catch (_: Exception) { null }
                                        }
                                        if (freshLoc != null && freshLoc.isCaptured) {
                                            lat = freshLoc.latitude
                                            lng = freshLoc.longitude
                                            acc = freshLoc.accuracy
                                        }
                                    }

                                    // Gera imagem PNG + Base64 da assinatura UMA única vez
                                    val batchSigId = "BATCH_OS_${System.currentTimeMillis()}"
                                    val sigFile = withContext(Dispatchers.IO) {
                                        saveSignatureToLocalFile(
                                            context = context,
                                            paths = signaturePaths,
                                            orderId = batchSigId
                                        )
                                    }
                                    val sigBase64 = withContext(Dispatchers.IO) {
                                        convertFileToBase64(sigFile)
                                    }

                                    viewModel.finalizeBatchOrders(
                                        drafts = drafts,
                                        openOrders = openOrders,
                                        fiscalName = fiscalName.trim().uppercase(Locale.getDefault()),
                                        fiscalRegistration = fiscalRegistration.trim().uppercase(Locale.getDefault()),
                                        fiscalRole = fiscalRole.trim().uppercase(Locale.getDefault()),
                                        fiscalContact = fiscalContact.trim().uppercase(Locale.getDefault()),
                                        signaturePath = sigFile.absolutePath,
                                        signatureBase64 = sigBase64,
                                        latitude = lat,
                                        longitude = lng,
                                        accuracy = acc,
                                        onProgress = { done, _ ->
                                            progressDone = done
                                        },
                                        onSuccess = { finalizedCount ->
                                            isSubmitting = false
                                            Toast.makeText(
                                                context,
                                                "$finalizedCount ${if (finalizedCount == 1) "Ordem de Serviço assinada" else "Ordens de Serviço assinadas"} e finalizadas em lote com sucesso!",
                                                Toast.LENGTH_LONG
                                            ).show()
                                            onBatchFinished(finalizedCount)
                                        },
                                        onError = { err ->
                                            isSubmitting = false
                                            validationError = err
                                            Toast.makeText(context, err, Toast.LENGTH_LONG).show()
                                        }
                                    )
                                } catch (e: Exception) {
                                    isSubmitting = false
                                    val msg = e.message ?: "Erro ao salvar assinatura do lote."
                                    validationError = msg
                                    Toast.makeText(context, msg, Toast.LENGTH_LONG).show()
                                }
                            }
                        },
                        modifier = Modifier
                            .weight(1.65f)
                            .height(52.dp),
                        shape = RoundedCornerShape(12.dp),
                        colors = ButtonDefaults.buttonColors(containerColor = Color(0xFF059669)),
                        contentPadding = PaddingValues(horizontal = 10.dp),
                        enabled = !isSubmitting
                    ) {
                        if (isSubmitting) {
                            CircularProgressIndicator(
                                color = Color.White,
                                modifier = Modifier.size(18.dp),
                                strokeWidth = 2.dp
                            )
                            Spacer(modifier = Modifier.width(8.dp))
                            Text(
                                text = "ASSINANDO ($progressDone/$totalSelected)...",
                                fontSize = 11.sp,
                                fontWeight = FontWeight.Black,
                                maxLines = 1
                            )
                        } else {
                            Icon(
                                imageVector = Icons.Default.DoneAll,
                                contentDescription = null,
                                modifier = Modifier.size(18.dp)
                            )
                            Spacer(modifier = Modifier.width(6.dp))
                            Text(
                                text = "ASSINAR TODAS ($totalSelected O.S.)",
                                fontSize = 12.sp,
                                fontWeight = FontWeight.Black,
                                maxLines = 1
                            )
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
            // 1. BANNER DO LOCAL DO LOTE
            Card(
                modifier = Modifier.fillMaxWidth(),
                shape = RoundedCornerShape(16.dp),
                colors = CardDefaults.cardColors(containerColor = Color(0xFF065F46))
            ) {
                Column(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(14.dp),
                    verticalArrangement = Arrangement.spacedBy(6.dp)
                ) {
                    Row(
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.SpaceBetween,
                        modifier = Modifier.fillMaxWidth()
                    ) {
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Icon(
                                imageVector = Icons.Default.DoneAll,
                                contentDescription = null,
                                tint = Color(0xFFA7F3D0),
                                modifier = Modifier.size(20.dp)
                            )
                            Spacer(modifier = Modifier.width(8.dp))
                            Text(
                                text = "ASSINATURA ÚNICA EM LOTE",
                                fontSize = 12.sp,
                                fontWeight = FontWeight.Black,
                                color = Color(0xFFA7F3D0),
                                letterSpacing = 0.4.sp
                            )
                        }
                        Surface(
                            shape = RoundedCornerShape(8.dp),
                            color = Color.White.copy(alpha = 0.16f)
                        ) {
                            Text(
                                text = "$totalSelected O.S.",
                                fontSize = 11.sp,
                                fontWeight = FontWeight.Black,
                                color = Color.White,
                                modifier = Modifier.padding(horizontal = 8.dp, vertical = 3.dp)
                            )
                        }
                    }

                    Text(
                        text = batchClientName,
                        fontSize = 15.sp,
                        fontWeight = FontWeight.Black,
                        color = Color.White,
                        maxLines = 2,
                        overflow = TextOverflow.Ellipsis
                    )
                    Row(verticalAlignment = Alignment.Top) {
                        Icon(
                            imageVector = Icons.Default.LocationOn,
                            contentDescription = null,
                            tint = Color(0xFF6EE7B7),
                            modifier = Modifier
                                .size(14.dp)
                                .padding(top = 1.dp)
                        )
                        Spacer(modifier = Modifier.width(4.dp))
                        Text(
                            text = batchAddressStreet,
                            fontSize = 12.sp,
                            color = Color(0xFFD1FAE5),
                            lineHeight = 16.sp
                        )
                    }

                    val breakdownText = buildString {
                        if (drafts.isNotEmpty()) {
                            append("${drafts.size} ${if (drafts.size == 1) "salva no aparelho" else "salvas no aparelho"}")
                        }
                        if (openOrders.isNotEmpty()) {
                            if (isNotEmpty()) append("  •  ")
                            append("${openOrders.size} ${if (openOrders.size == 1) "aberta pelo administrativo" else "abertas pelo administrativo"}")
                        }
                    }
                    if (breakdownText.isNotBlank()) {
                        Text(
                            text = breakdownText,
                            fontSize = 10.sp,
                            fontWeight = FontWeight.SemiBold,
                            color = Color(0xFFA7F3D0)
                        )
                    }
                }
            }

            // 2. CONFERÊNCIA DAS O.S. INCLUÍDAS NO LOTE (PARA O FISCAL CONFERIR TUDO ANTES DE ASSINAR)
            Card(
                modifier = Modifier.fillMaxWidth(),
                shape = RoundedCornerShape(16.dp),
                colors = CardDefaults.cardColors(containerColor = Color.White),
                elevation = CardDefaults.cardElevation(defaultElevation = 1.dp)
            ) {
                Column(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(14.dp),
                    verticalArrangement = Arrangement.spacedBy(10.dp)
                ) {
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .clickable { isItemsExpanded = !isItemsExpanded },
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Row(
                            verticalAlignment = Alignment.CenterVertically,
                            modifier = Modifier.weight(1f)
                        ) {
                            Icon(
                                imageVector = Icons.Default.Checklist,
                                contentDescription = null,
                                tint = BluePrimary,
                                modifier = Modifier.size(19.dp)
                            )
                            Spacer(modifier = Modifier.width(8.dp))
                            Column {
                                Text(
                                    text = "1. Conferência dos Serviços ($totalSelected O.S.)",
                                    fontSize = 13.sp,
                                    fontWeight = FontWeight.Black,
                                    color = TextPrimary
                                )
                                Text(
                                    text = "Serviços realizados que serão validados nesta assinatura",
                                    fontSize = 10.sp,
                                    color = TextSecondary
                                )
                            }
                        }
                        Icon(
                            imageVector = if (isItemsExpanded) Icons.Default.ExpandLess else Icons.Default.ExpandMore,
                            contentDescription = null,
                            tint = TextSecondary
                        )
                    }

                    if (isItemsExpanded) {
                        HorizontalDivider(color = Color(0xFFF1F5F9))

                        drafts.forEachIndexed { idx, draft ->
                            val equipTitle = draft.equipmentDisplay.ifBlank {
                                listOf(draft.equipmentName, draft.equipmentSector, draft.equipmentBtus.takeIf { it.isNotBlank() }?.let { "$it BTUs" })
                                    .filterNotNull()
                                    .filter { it.isNotBlank() }
                                    .joinToString(" • ")
                                    .ifBlank { "Equipamento não informado" }
                            }
                            BatchReviewItemBox(
                                badgeText = "NOVA O.S. #${idx + 1} (SALVA)",
                                badgeBg = Color(0xFFDBEAFE),
                                badgeColor = Color(0xFF1D4ED8),
                                title = equipTitle,
                                problem = draft.description,
                                solution = draft.solution,
                                photoCount = draft.photoPaths.size
                            )
                        }

                        openOrders.forEach { order ->
                            BatchReviewItemBox(
                                badgeText = "O.S. #${order.osNumber} (ADMIN)",
                                badgeBg = Color(0xFFEDE9FE),
                                badgeColor = Color(0xFF581C87),
                                title = order.type.ifBlank { "MANUTENÇÃO CORRETIVA" },
                                problem = order.generalNotes.orEmpty(),
                                solution = "",
                                photoCount = 0
                            )
                        }
                    }
                }
            }

            // 3. DADOS DO FISCAL / RESPONSÁVEL E ASSINATURA ÚNICA
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
                        text = "2. Dados do Fiscal / Responsável",
                        fontSize = 13.sp,
                        fontWeight = FontWeight.Black,
                        color = TextPrimary
                    )

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
                            placeholder = { Text("Nome completo do fiscal", fontSize = 11.sp) },
                            singleLine = true
                        )
                    }

                    Column {
                        Text(
                            text = "MATRÍCULA / DOCUMENTO *",
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
                            placeholder = { Text("Matrícula funcional, RG ou CPF", fontSize = 11.sp) },
                            singleLine = true
                        )
                    }

                    Column {
                        Text(
                            text = "CARGO / FUNÇÃO",
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
                            placeholder = { Text("Cargo ou função do responsável", fontSize = 11.sp) },
                            singleLine = true
                        )
                    }

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
                            placeholder = { Text("E-mail ou telefone de contato", fontSize = 11.sp) },
                            singleLine = true
                        )
                    }

                    // Assinatura Única
                    Column {
                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.SpaceBetween,
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            Text(
                                text = "ASSINATURA DIGITAL ÚNICA *",
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
                        Spacer(modifier = Modifier.height(4.dp))
                        Text(
                            text = "Esta assinatura será aplicada automaticamente em todas as $totalSelected Ordens de Serviço listadas acima.",
                            fontSize = 11.sp,
                            color = TextSecondary,
                            lineHeight = 15.sp
                        )
                        Spacer(modifier = Modifier.height(8.dp))

                        SignaturePad(
                            modifier = Modifier
                                .fillMaxWidth()
                                .height(200.dp),
                            paths = signaturePaths,
                            onSignatureChanged = { signed ->
                                hasSignature = signed
                            }
                        )
                    }

                    validationError?.let { err ->
                        Surface(
                            modifier = Modifier.fillMaxWidth(),
                            shape = RoundedCornerShape(10.dp),
                            color = Color(0xFFFEE2E2),
                            border = BorderStroke(1.dp, Color(0xFFFCA5A5))
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
}

@Composable
private fun BatchReviewItemBox(
    badgeText: String,
    badgeBg: Color,
    badgeColor: Color,
    title: String,
    problem: String,
    solution: String,
    photoCount: Int
) {
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(12.dp))
            .background(Color(0xFFF8FAFC))
            .border(1.dp, Color(0xFFE2E8F0), RoundedCornerShape(12.dp))
            .padding(10.dp),
        verticalArrangement = Arrangement.spacedBy(4.dp)
    ) {
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically
        ) {
            Box(
                modifier = Modifier
                    .clip(RoundedCornerShape(6.dp))
                    .background(badgeBg)
                    .padding(horizontal = 7.dp, vertical = 2.dp)
            ) {
                Text(
                    text = badgeText,
                    fontSize = 9.sp,
                    fontWeight = FontWeight.Black,
                    color = badgeColor
                )
            }
            if (photoCount > 0) {
                Text(
                    text = "$photoCount ${if (photoCount == 1) "foto" else "fotos"}",
                    fontSize = 10.sp,
                    fontWeight = FontWeight.Bold,
                    color = BluePrimary
                )
            }
        }

        Text(
            text = title,
            fontSize = 12.sp,
            fontWeight = FontWeight.Black,
            color = TextPrimary,
            maxLines = 2,
            overflow = TextOverflow.Ellipsis
        )

        if (problem.isNotBlank()) {
            Text(
                text = "Descrição: $problem",
                fontSize = 11.sp,
                color = TextSecondary,
                lineHeight = 15.sp,
                maxLines = 2,
                overflow = TextOverflow.Ellipsis
            )
        }
        if (solution.isNotBlank()) {
            Text(
                text = "Solução: $solution",
                fontSize = 11.sp,
                color = Color(0xFF065F46),
                fontWeight = FontWeight.SemiBold,
                lineHeight = 15.sp,
                maxLines = 2,
                overflow = TextOverflow.Ellipsis
            )
        }
    }
}
