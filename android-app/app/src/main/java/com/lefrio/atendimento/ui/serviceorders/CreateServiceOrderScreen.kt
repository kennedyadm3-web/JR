package com.lefrio.atendimento.ui.serviceorders

import android.util.Base64
import android.widget.Toast
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
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
import com.lefrio.atendimento.ui.signature.components.SignaturePad
import com.lefrio.atendimento.ui.signature.components.SignaturePath
import com.lefrio.atendimento.ui.signature.components.saveSignatureToLocalFile
import com.lefrio.atendimento.ui.theme.BluePrimary
import com.lefrio.atendimento.ui.theme.TextPrimary
import com.lefrio.atendimento.ui.theme.TextSecondary
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
    onBackClick: () -> Unit,
    onOrderCreated: (orderId: String) -> Unit
) {
    val uiState by viewModel.uiState.collectAsState()
    val context = LocalContext.current

    // Campos de Seleção do Local do Roteiro
    var selectedClientId by remember { mutableStateOf("") }
    var selectedClientName by remember { mutableStateOf("") }
    var selectedAddressId by remember { mutableStateOf("") }
    var selectedAddressStreet by remember { mutableStateOf("") }
    var selectedEquipmentId by remember { mutableStateOf("") }
    var selectedEquipmentName by remember { mutableStateOf("") }

    // Campos Técnicos do Atendimento
    var description by remember { mutableStateOf("") }
    var diagnosis by remember { mutableStateOf("") }
    var solution by remember { mutableStateOf("") }

    // Campos do Fiscal / Responsável
    var fiscalName by remember { mutableStateOf("") }
    var fiscalRegistration by remember { mutableStateOf("") }
    val signaturePaths = remember { mutableStateListOf<SignaturePath>() }
    var hasSignature by remember { mutableStateOf(false) }

    // Estados de UI e Validação
    var isSubmitting by remember { mutableStateOf(false) }
    var validationError by remember { mutableStateOf<String?>(null) }
    var clientExpanded by remember { mutableStateOf(false) }
    var addressExpanded by remember { mutableStateOf(false) }
    var equipmentExpanded by remember { mutableStateOf(false) }

    val filteredAddresses = remember(selectedClientId, uiState.addresses) {
        if (selectedClientId.isBlank()) {
            uiState.addresses
        } else {
            uiState.addresses.filter { it.clientId == selectedClientId }
        }
    }

    // Auto-seleciona cliente quando houver apenas 1 programado no roteiro de hoje
    LaunchedEffect(uiState.clients) {
        if (uiState.clients.size == 1 && selectedClientId.isBlank()) {
            selectedClientId = uiState.clients[0].id
            selectedClientName = uiState.clients[0].name
        }
    }

    // Auto-seleciona endereço quando houver apenas 1 para o cliente selecionado
    LaunchedEffect(filteredAddresses) {
        if (filteredAddresses.size == 1 && selectedAddressId.isBlank()) {
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
                            text = "Nova Ordem de Serviço",
                            fontSize = 17.sp,
                            fontWeight = FontWeight.Black,
                            color = BluePrimary
                        )
                        Text(
                            text = "Abertura no Local de Atendimento • ${user.name}",
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
                        .padding(horizontal = 16.dp, vertical = 12.dp),
                    horizontalArrangement = Arrangement.spacedBy(12.dp)
                ) {
                    OutlinedButton(
                        onClick = onBackClick,
                        modifier = Modifier
                            .weight(1f)
                            .height(50.dp),
                        shape = RoundedCornerShape(12.dp),
                        enabled = !isSubmitting
                    ) {
                        Text("VOLTAR", fontSize = 12.sp, fontWeight = FontWeight.Bold, color = TextSecondary)
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
                                tech2Name = null,
                                description = description,
                                diagnosis = diagnosis,
                                solution = solution,
                                fiscalName = fiscalName,
                                fiscalRegistration = fiscalRegistration,
                                signaturePath = sigFile?.absolutePath,
                                signatureBase64 = sigBase64,
                                isFinalized = true,
                                onSuccess = { createdId ->
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
                            .weight(1.8f)
                            .height(50.dp),
                        shape = RoundedCornerShape(12.dp),
                        colors = ButtonDefaults.buttonColors(containerColor = Color(0xFF581C87)),
                        enabled = !isSubmitting && uiState.clients.isNotEmpty()
                    ) {
                        if (isSubmitting) {
                            CircularProgressIndicator(
                                color = Color.White,
                                modifier = Modifier.size(20.dp),
                                strokeWidth = 2.dp
                            )
                        } else {
                            Icon(Icons.Default.CheckCircle, contentDescription = null, modifier = Modifier.size(18.dp))
                            Spacer(modifier = Modifier.width(6.dp))
                            Text("FINALIZAR E CRIAR O.S.", fontSize = 12.sp, fontWeight = FontWeight.Black)
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
                colors = CardDefaults.cardColors(containerColor = Color(0xFF3B1578))
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
                            .background(Color(0xFF581C87)),
                        contentAlignment = Alignment.Center
                    ) {
                        Icon(
                            imageVector = Icons.Default.Build,
                            contentDescription = null,
                            tint = Color(0xFFD8B4FE),
                            modifier = Modifier.size(22.dp)
                        )
                    }
                    Spacer(modifier = Modifier.width(12.dp))
                    Column {
                        Text(
                            text = "Abertura de Ordem de Serviço",
                            fontWeight = FontWeight.Black,
                            fontSize = 14.sp,
                            color = Color.White
                        )
                        Text(
                            text = "Preencha a máquina atendida, o laudo e a assinatura do fiscal no local.",
                            fontSize = 11.sp,
                            color = Color(0xFFD8B4FE)
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

                    if (uiState.clients.isEmpty()) {
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
                                    text = "MÁQUINA / EQUIPAMENTO DO ENDEREÇO *",
                                    fontSize = 11.sp,
                                    fontWeight = FontWeight.Bold,
                                    color = TextSecondary
                                )
                                if (uiState.isLoadingEquipments) {
                                    Row(verticalAlignment = Alignment.CenterVertically) {
                                        CircularProgressIndicator(
                                            modifier = Modifier.size(12.dp),
                                            strokeWidth = 1.5.dp,
                                            color = BluePrimary
                                        )
                                        Spacer(modifier = Modifier.width(4.dp))
                                        Text("Carregando máquinas...", fontSize = 10.sp, color = BluePrimary)
                                    }
                                } else if (selectedAddressId.isNotBlank()) {
                                    Text(
                                        text = "${uiState.equipments.size} máquina(s) encontrada(s)",
                                        fontSize = 10.sp,
                                        color = Color(0xFF059669),
                                        fontWeight = FontWeight.Bold
                                    )
                                }
                            }
                            Spacer(modifier = Modifier.height(4.dp))
                            Box(modifier = Modifier.fillMaxWidth()) {
                                OutlinedTextField(
                                    value = selectedEquipmentName.ifBlank {
                                        if (selectedAddressId.isBlank()) "Selecione o Endereço primeiro..." else "Selecione a máquina deste endereço..."
                                    },
                                    onValueChange = {},
                                    readOnly = true,
                                    enabled = selectedAddressId.isNotBlank(),
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
                                            DropdownMenuItem(
                                                text = {
                                                    Column {
                                                        Text(
                                                            text = eq.name,
                                                            fontSize = 13.sp,
                                                            fontWeight = FontWeight.Bold,
                                                            color = TextPrimary
                                                        )
                                                        val details = listOfNotNull(
                                                            eq.brand?.takeIf { it.isNotBlank() },
                                                            eq.btu?.takeIf { it.isNotBlank() }?.let { "$it BTUs" },
                                                            eq.sector?.takeIf { it.isNotBlank() }
                                                        ).joinToString(" • ")
                                                        if (details.isNotBlank()) {
                                                            Text(
                                                                text = details,
                                                                fontSize = 11.sp,
                                                                color = TextSecondary
                                                            )
                                                        }
                                                    }
                                                },
                                                onClick = {
                                                    selectedEquipmentId = eq.id
                                                    selectedEquipmentName = eq.name
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
                            onValueChange = { description = it },
                            modifier = Modifier
                                .fillMaxWidth()
                                .height(85.dp),
                            shape = RoundedCornerShape(12.dp),
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
                            onValueChange = { diagnosis = it },
                            modifier = Modifier
                                .fillMaxWidth()
                                .height(85.dp),
                            shape = RoundedCornerShape(12.dp),
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
                            onValueChange = { solution = it },
                            modifier = Modifier
                                .fillMaxWidth()
                                .height(85.dp),
                            shape = RoundedCornerShape(12.dp),
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
                            onValueChange = { fiscalName = it },
                            modifier = Modifier.fillMaxWidth(),
                            shape = RoundedCornerShape(12.dp),
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
                            onValueChange = { fiscalRegistration = it },
                            modifier = Modifier.fillMaxWidth(),
                            shape = RoundedCornerShape(12.dp),
                            leadingIcon = {
                                Icon(Icons.Default.AccountBox, contentDescription = null, tint = BluePrimary, modifier = Modifier.size(18.dp))
                            },
                            placeholder = {
                                Text("Matrícula funcional ou documento do fiscal", fontSize = 11.sp)
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
}

