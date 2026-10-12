package com.lefrio.atendimento.ui.serviceorders

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
import com.lefrio.atendimento.ui.theme.BluePrimary
import com.lefrio.atendimento.ui.theme.TextPrimary
import com.lefrio.atendimento.ui.theme.TextSecondary
import java.text.SimpleDateFormat
import java.util.*

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

    val todayStr = remember {
        SimpleDateFormat("yyyy-MM-dd", Locale.getDefault()).format(Date())
    }
    var plannedDate by remember { mutableStateOf(todayStr) }
    var selectedType by remember { mutableStateOf("MANUTENÇÃO CORRETIVA CONTRATO") }
    var selectedClientId by remember { mutableStateOf("") }
    var selectedClientName by remember { mutableStateOf("") }
    var selectedAddressId by remember { mutableStateOf("") }
    var selectedAddressStreet by remember { mutableStateOf("") }
    var selectedEquipmentId by remember { mutableStateOf<String?>("") }
    var selectedEquipmentName by remember { mutableStateOf<String?>("") }
    var selectedTech2Name by remember { mutableStateOf("") }
    var description by remember { mutableStateOf("") }
    var isSubmitting by remember { mutableStateOf(false) }
    var validationError by remember { mutableStateOf<String?>(null) }

    // Dropdown expanded states
    var typeExpanded by remember { mutableStateOf(false) }
    var clientExpanded by remember { mutableStateOf(false) }
    var addressExpanded by remember { mutableStateOf(false) }
    var equipmentExpanded by remember { mutableStateOf(false) }
    var tech2Expanded by remember { mutableStateOf(false) }

    val serviceTypes = listOf(
        "MANUTENÇÃO CORRETIVA CONTRATO",
        "MANUTENÇÃO PREVENTIVA EXTRA",
        "INSTALAÇÃO / REMOÇÃO",
        "DESLOCAMENTO / VISTORIA",
        "ORÇAMENTO",
        "OUTROS"
    )

    val filteredAddresses = remember(selectedClientId, uiState.addresses) {
        if (selectedClientId.isBlank()) {
            uiState.addresses
        } else {
            uiState.addresses.filter { it.clientId == selectedClientId }
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
                            text = "Agendar Chamado no Roteiro • ${user.name}",
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
                            .height(48.dp),
                        shape = RoundedCornerShape(12.dp),
                        enabled = !isSubmitting
                    ) {
                        Text("VOLTAR", fontSize = 12.sp, fontWeight = FontWeight.Bold, color = TextSecondary)
                    }

                    Button(
                        onClick = {
                            if (selectedClientName.isBlank()) {
                                validationError = "Por favor, selecione ou informe o Cliente."
                                return@Button
                            }
                            if (selectedAddressStreet.isBlank()) {
                                validationError = "Por favor, selecione ou informe o Endereço."
                                return@Button
                            }
                            isSubmitting = true
                            validationError = null
                            viewModel.createServiceOrder(
                                date = plannedDate,
                                type = selectedType,
                                clientId = selectedClientId.ifBlank { "CLI_MANUAL_${System.currentTimeMillis()}" },
                                clientName = selectedClientName,
                                addressId = selectedAddressId.ifBlank { "ADDR_MANUAL_${System.currentTimeMillis()}" },
                                addressStreet = selectedAddressStreet,
                                equipmentId = selectedEquipmentId,
                                equipmentName = selectedEquipmentName,
                                tech2Name = selectedTech2Name.ifBlank { null },
                                description = description,
                                onSuccess = { createdId ->
                                    isSubmitting = false
                                    Toast.makeText(context, "Ordem de Serviço criada e agendada com sucesso!", Toast.LENGTH_LONG).show()
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
                            .weight(1.6f)
                            .height(48.dp),
                        shape = RoundedCornerShape(12.dp),
                        colors = ButtonDefaults.buttonColors(containerColor = Color(0xFF581C87)),
                        enabled = !isSubmitting
                    ) {
                        if (isSubmitting) {
                            CircularProgressIndicator(
                                color = Color.White,
                                modifier = Modifier.size(20.dp),
                                strokeWidth = 2.dp
                            )
                        } else {
                            Icon(Icons.Default.Add, contentDescription = null, modifier = Modifier.size(18.dp))
                            Spacer(modifier = Modifier.width(6.dp))
                            Text("CRIAR E AGENDAR O.S.", fontSize = 12.sp, fontWeight = FontWeight.Black)
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
            // Banner informativo estilo PWA
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
                            text = "Agendar O.S. no Roteiro Diário",
                            fontWeight = FontWeight.Black,
                            fontSize = 14.sp,
                            color = Color.White
                        )
                        Text(
                            text = "Organize a ordem de serviço para a equipe técnica sem afetar o cronograma de preventivas",
                            fontSize = 11.sp,
                            color = Color(0xFFD8B4FE)
                        )
                    }
                }
            }

            // 1. Data e Tipo
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
                    verticalArrangement = Arrangement.spacedBy(12.dp)
                ) {
                    Text(
                        text = "1. Programação e Tipo de Chamado",
                        fontSize = 13.sp,
                        fontWeight = FontWeight.Black,
                        color = TextPrimary
                    )

                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.spacedBy(10.dp)
                    ) {
                        // Data Programada
                        Column(modifier = Modifier.weight(1f)) {
                            Text(
                                text = "DATA PROGRAMADA *",
                                fontSize = 11.sp,
                                fontWeight = FontWeight.Bold,
                                color = TextSecondary
                            )
                            Spacer(modifier = Modifier.height(4.dp))
                            OutlinedTextField(
                                value = plannedDate,
                                onValueChange = { plannedDate = it },
                                modifier = Modifier.fillMaxWidth(),
                                shape = RoundedCornerShape(12.dp),
                                placeholder = { Text("AAAA-MM-DD", fontSize = 12.sp) },
                                leadingIcon = {
                                    Icon(Icons.Default.DateRange, contentDescription = null, tint = BluePrimary, modifier = Modifier.size(18.dp))
                                },
                                singleLine = true
                            )
                        }

                        // Tipo de Atendimento
                        Column(modifier = Modifier.weight(1.3f)) {
                            Text(
                                text = "TIPO DO ATENDIMENTO *",
                                fontSize = 11.sp,
                                fontWeight = FontWeight.Bold,
                                color = TextSecondary
                            )
                            Spacer(modifier = Modifier.height(4.dp))
                            Box {
                                OutlinedTextField(
                                    value = selectedType,
                                    onValueChange = {},
                                    readOnly = true,
                                    modifier = Modifier
                                        .fillMaxWidth()
                                        .clickable { typeExpanded = true },
                                    shape = RoundedCornerShape(12.dp),
                                    trailingIcon = {
                                        IconButton(onClick = { typeExpanded = !typeExpanded }) {
                                            Icon(Icons.Default.ArrowDropDown, contentDescription = null)
                                        }
                                    },
                                    singleLine = true
                                )
                                DropdownMenu(
                                    expanded = typeExpanded,
                                    onDismissRequest = { typeExpanded = false }
                                ) {
                                    serviceTypes.forEach { typeItem ->
                                        DropdownMenuItem(
                                            text = { Text(typeItem, fontSize = 12.sp, fontWeight = FontWeight.SemiBold) },
                                            onClick = {
                                                selectedType = typeItem
                                                typeExpanded = false
                                            }
                                        )
                                    }
                                }
                            }
                        }
                    }
                }
            }

            // 2. Equipe Técnica
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
                    verticalArrangement = Arrangement.spacedBy(12.dp)
                ) {
                    Text(
                        text = "2. Equipe Técnica Escalada",
                        fontSize = 13.sp,
                        fontWeight = FontWeight.Black,
                        color = TextPrimary
                    )

                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.spacedBy(10.dp)
                    ) {
                        Column(modifier = Modifier.weight(1f)) {
                            Text(
                                text = "TÉCNICO RESPONSÁVEL *",
                                fontSize = 11.sp,
                                fontWeight = FontWeight.Bold,
                                color = TextSecondary
                            )
                            Spacer(modifier = Modifier.height(4.dp))
                            OutlinedTextField(
                                value = user.name,
                                onValueChange = {},
                                readOnly = true,
                                modifier = Modifier.fillMaxWidth(),
                                shape = RoundedCornerShape(12.dp),
                                leadingIcon = {
                                    Icon(Icons.Default.Person, contentDescription = null, tint = Color(0xFF059669), modifier = Modifier.size(18.dp))
                                },
                                singleLine = true
                            )
                        }

                        Column(modifier = Modifier.weight(1f)) {
                            Text(
                                text = "TÉCNICO AUXILIAR",
                                fontSize = 11.sp,
                                fontWeight = FontWeight.Bold,
                                color = TextSecondary
                            )
                            Spacer(modifier = Modifier.height(4.dp))
                            Box {
                                OutlinedTextField(
                                    value = selectedTech2Name.ifBlank { "Nenhum / Solo" },
                                    onValueChange = {},
                                    readOnly = true,
                                    modifier = Modifier
                                        .fillMaxWidth()
                                        .clickable { tech2Expanded = true },
                                    shape = RoundedCornerShape(12.dp),
                                    trailingIcon = {
                                        IconButton(onClick = { tech2Expanded = !tech2Expanded }) {
                                            Icon(Icons.Default.ArrowDropDown, contentDescription = null)
                                        }
                                    },
                                    singleLine = true
                                )
                                DropdownMenu(
                                    expanded = tech2Expanded,
                                    onDismissRequest = { tech2Expanded = false }
                                ) {
                                    DropdownMenuItem(
                                        text = { Text("Nenhum / Solo", fontSize = 12.sp) },
                                        onClick = {
                                            selectedTech2Name = ""
                                            tech2Expanded = false
                                        }
                                    )
                                    uiState.technicians.filter { it.id != user.uid }.forEach { tech ->
                                        DropdownMenuItem(
                                            text = { Text(tech.name, fontSize = 12.sp) },
                                            onClick = {
                                                selectedTech2Name = tech.name
                                                tech2Expanded = false
                                            }
                                        )
                                    }
                                }
                            }
                        }
                    }
                }
            }

            // 3. Cliente e Endereço
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
                    verticalArrangement = Arrangement.spacedBy(12.dp)
                ) {
                    Text(
                        text = "3. Cliente e Local do Atendimento",
                        fontSize = 13.sp,
                        fontWeight = FontWeight.Black,
                        color = TextPrimary
                    )

                    // Cliente
                    Column {
                        Text(
                            text = "CLIENTE *",
                            fontSize = 11.sp,
                            fontWeight = FontWeight.Bold,
                            color = TextSecondary
                        )
                        Spacer(modifier = Modifier.height(4.dp))
                        Box {
                            OutlinedTextField(
                                value = selectedClientName.ifBlank { "Selecione o Cliente..." },
                                onValueChange = { selectedClientName = it },
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .clickable { clientExpanded = true },
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
                            DropdownMenu(
                                expanded = clientExpanded,
                                onDismissRequest = { clientExpanded = false }
                            ) {
                                if (uiState.clients.isEmpty()) {
                                    DropdownMenuItem(
                                        text = { Text("Nenhum cliente cadastrado no momento", fontSize = 12.sp) },
                                        onClick = { clientExpanded = false }
                                    )
                                } else {
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
                                                clientExpanded = false
                                            }
                                        )
                                    }
                                }
                            }
                        }
                    }

                    // Endereço
                    Column {
                        Text(
                            text = "ENDEREÇO DE ATENDIMENTO *",
                            fontSize = 11.sp,
                            fontWeight = FontWeight.Bold,
                            color = TextSecondary
                        )
                        Spacer(modifier = Modifier.height(4.dp))
                        Box {
                            OutlinedTextField(
                                value = selectedAddressStreet.ifBlank { "Selecione o Endereço..." },
                                onValueChange = { selectedAddressStreet = it },
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .clickable { addressExpanded = true },
                                shape = RoundedCornerShape(12.dp),
                                leadingIcon = {
                                    Icon(Icons.Default.LocationOn, contentDescription = null, tint = Color(0xFFDC2626), modifier = Modifier.size(18.dp))
                                },
                                trailingIcon = {
                                    IconButton(onClick = { addressExpanded = !addressExpanded }) {
                                        Icon(Icons.Default.ArrowDropDown, contentDescription = null)
                                    }
                                }
                            )
                            DropdownMenu(
                                expanded = addressExpanded,
                                onDismissRequest = { addressExpanded = false }
                            ) {
                                if (filteredAddresses.isEmpty()) {
                                    DropdownMenuItem(
                                        text = { Text("Nenhum endereço encontrado para este cliente", fontSize = 12.sp) },
                                        onClick = { addressExpanded = false }
                                    )
                                } else {
                                    filteredAddresses.forEach { a ->
                                        DropdownMenuItem(
                                            text = { Text(a.street, fontSize = 12.sp) },
                                            onClick = {
                                                selectedAddressId = a.id
                                                selectedAddressStreet = a.street
                                                if (selectedClientId.isBlank()) {
                                                    selectedClientId = a.clientId
                                                }
                                                viewModel.loadEquipmentsForAddress(a.id)
                                                addressExpanded = false
                                            }
                                        )
                                    }
                                }
                            }
                        }
                    }
                }
            }

            // 4. Máquina e Observações
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
                    verticalArrangement = Arrangement.spacedBy(12.dp)
                ) {
                    Text(
                        text = "4. Equipamento e Detalhes",
                        fontSize = 13.sp,
                        fontWeight = FontWeight.Black,
                        color = TextPrimary
                    )

                    // Equipamento
                    Column {
                        Text(
                            text = "MÁQUINA / EQUIPAMENTO ATENDIDO (OPCIONAL)",
                            fontSize = 11.sp,
                            fontWeight = FontWeight.Bold,
                            color = TextSecondary
                        )
                        Spacer(modifier = Modifier.height(4.dp))
                        Box {
                            OutlinedTextField(
                                value = selectedEquipmentName?.ifBlank { "OUTRO EQUIPAMENTO" } ?: "OUTRO EQUIPAMENTO",
                                onValueChange = {},
                                readOnly = true,
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .clickable { equipmentExpanded = true },
                                shape = RoundedCornerShape(12.dp),
                                leadingIcon = {
                                    Icon(Icons.Default.Settings, contentDescription = null, tint = BluePrimary, modifier = Modifier.size(18.dp))
                                },
                                trailingIcon = {
                                    IconButton(onClick = { equipmentExpanded = !equipmentExpanded }) {
                                        Icon(Icons.Default.ArrowDropDown, contentDescription = null)
                                    }
                                }
                            )
                            DropdownMenu(
                                expanded = equipmentExpanded,
                                onDismissRequest = { equipmentExpanded = false }
                            ) {
                                DropdownMenuItem(
                                    text = { Text("OUTRO EQUIPAMENTO (Avulso)", fontSize = 12.sp, fontWeight = FontWeight.Bold) },
                                    onClick = {
                                        selectedEquipmentId = "OUTRO EQUIPAMENTO"
                                        selectedEquipmentName = "OUTRO EQUIPAMENTO"
                                        equipmentExpanded = false
                                    }
                                )
                                uiState.equipments.forEach { eq ->
                                    DropdownMenuItem(
                                        text = {
                                            Column {
                                                Text(eq.name, fontSize = 12.sp, fontWeight = FontWeight.SemiBold)
                                                Text("${eq.brand ?: ""} ${eq.btu ?: ""} • ${eq.sector ?: ""}", fontSize = 10.sp, color = TextSecondary)
                                            }
                                        },
                                        onClick = {
                                            selectedEquipmentId = eq.id
                                            selectedEquipmentName = eq.name
                                            equipmentExpanded = false
                                        }
                                    )
                                }
                            }
                        }
                    }

                    // Descrição
                    Column {
                        Text(
                            text = "MOTIVO DO CHAMADO / OBSERVAÇÕES *",
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
                                .height(110.dp),
                            shape = RoundedCornerShape(12.dp),
                            placeholder = {
                                Text(
                                    "Descreva o motivo do chamado, problemas relatados pelo cliente ou instruções da equipe técnica...",
                                    fontSize = 11.sp
                                )
                            }
                        )
                    }

                    // Erro
                    validationError?.let { err ->
                        Text(
                            text = err,
                            color = Color(0xFFDC2626),
                            fontSize = 12.sp,
                            fontWeight = FontWeight.Bold
                        )
                    }
                }
            }

            Spacer(modifier = Modifier.height(16.dp))
        }
    }
}
