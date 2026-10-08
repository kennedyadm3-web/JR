package com.lefrio.atendimento.ui.expenses

import android.widget.Toast
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
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
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.lefrio.atendimento.data.local.entity.RouteExpenseEntity
import com.lefrio.atendimento.ui.theme.BluePrimary
import com.lefrio.atendimento.ui.theme.TextPrimary
import com.lefrio.atendimento.ui.theme.TextSecondary
import com.lefrio.atendimento.util.PhotoCaptureManager
import java.io.File
import java.util.*

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun RouteExpensesScreen(
    viewModel: RouteExpensesViewModel,
    onBackClick: () -> Unit
) {
    val uiState by viewModel.uiState.collectAsState()
    val context = LocalContext.current
    val photoCaptureManager = remember { PhotoCaptureManager(context) }

    var selectedCategory by remember { mutableStateOf("combustivel") }
    var amountText by remember { mutableStateOf("") }
    var description by remember { mutableStateOf("") }
    var receiptPhotoPath by remember { mutableStateOf<String?>(null) }
    var currentPhotoFile by remember { mutableStateOf<File?>(null) }
    var showForm by remember { mutableStateOf(false) }

    val cameraLauncher = rememberLauncherForActivityResult(
        contract = ActivityResultContracts.TakePicture()
    ) { success ->
        if (success && currentPhotoFile != null) {
            val compressed = photoCaptureManager.compressPhoto(currentPhotoFile!!)
            receiptPhotoPath = compressed.absolutePath
            Toast.makeText(context, "Comprovante capturado!", Toast.LENGTH_SHORT).show()
        }
    }

    LaunchedEffect(uiState.successMessage) {
        uiState.successMessage?.let {
            Toast.makeText(context, it, Toast.LENGTH_SHORT).show()
            amountText = ""
            description = ""
            receiptPhotoPath = null
            showForm = false
            viewModel.clearMessages()
        }
    }

    LaunchedEffect(uiState.errorMessage) {
        uiState.errorMessage?.let {
            Toast.makeText(context, it, Toast.LENGTH_LONG).show()
            viewModel.clearMessages()
        }
    }

    val categories = listOf(
        Pair("combustivel", "Combustível"),
        Pair("pedagio", "Pedágio"),
        Pair("alimentacao", "Alimentação"),
        Pair("hospedagem", "Hospedagem"),
        Pair("material", "Peças/Material"),
        Pair("outros", "Outros")
    )

    Scaffold(
        topBar = {
            TopAppBar(
                title = {
                    Text(
                        text = "Despesas de Rota",
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
        floatingActionButton = {
            FloatingActionButton(
                onClick = { showForm = !showForm },
                containerColor = BluePrimary,
                contentColor = Color.White,
                shape = RoundedCornerShape(16.dp)
            ) {
                Icon(
                    imageVector = if (showForm) Icons.Default.Close else Icons.Default.Add,
                    contentDescription = "Nova Despesa"
                )
            }
        },
        containerColor = Color(0xFFF8FAFC)
    ) { paddingValues ->
        LazyColumn(
            modifier = Modifier
                .fillMaxSize()
                .padding(paddingValues),
            contentPadding = PaddingValues(16.dp)
        ) {
            // Card de Total Acumulado
            item {
                Card(
                    modifier = Modifier.fillMaxWidth(),
                    shape = RoundedCornerShape(16.dp),
                    colors = CardDefaults.cardColors(containerColor = Color.White),
                    elevation = CardDefaults.cardElevation(defaultElevation = 2.dp)
                ) {
                    Column(modifier = Modifier.padding(18.dp)) {
                        Text(
                            text = "TOTAL DE DESPESAS EM ROTA",
                            fontSize = 10.sp,
                            fontWeight = FontWeight.Black,
                            color = TextSecondary,
                            letterSpacing = 0.5.sp
                        )
                        Spacer(modifier = Modifier.height(4.dp))
                        Text(
                            text = "R$ ${String.format(Locale.GERMANY, "%.2f", uiState.totalAmount)}",
                            fontSize = 24.sp,
                            fontWeight = FontWeight.Black,
                            color = BluePrimary
                        )
                        Spacer(modifier = Modifier.height(6.dp))
                        Text(
                            text = "${uiState.expenses.size} comprovante(s) lançado(s) nesta jornada",
                            fontSize = 11.sp,
                            color = TextSecondary
                        )
                    }
                }
                Spacer(modifier = Modifier.height(14.dp))
            }

            // Formulário de Nova Despesa (Quando aberto)
            if (showForm) {
                item {
                    Card(
                        modifier = Modifier.fillMaxWidth(),
                        shape = RoundedCornerShape(16.dp),
                        colors = CardDefaults.cardColors(containerColor = Color.White),
                        elevation = CardDefaults.cardElevation(defaultElevation = 4.dp)
                    ) {
                        Column(modifier = Modifier.padding(18.dp)) {
                            Text(
                                text = "Lançar Nova Despesa",
                                fontWeight = FontWeight.Black,
                                fontSize = 14.sp,
                                color = TextPrimary
                            )

                            Spacer(modifier = Modifier.height(12.dp))

                            // Categorias
                            Text(text = "Categoria:", fontSize = 11.sp, fontWeight = FontWeight.Bold, color = TextSecondary)
                            Spacer(modifier = Modifier.height(6.dp))
                            Row(
                                modifier = Modifier.fillMaxWidth(),
                                horizontalArrangement = Arrangement.spacedBy(6.dp)
                            ) {
                                categories.take(3).forEach { (id, label) ->
                                    val isSelected = selectedCategory == id
                                    Box(
                                        modifier = Modifier
                                            .weight(1f)
                                            .clip(RoundedCornerShape(8.dp))
                                            .background(if (isSelected) BluePrimary else Color(0xFFF1F5F9))
                                            .clickable { selectedCategory = id }
                                            .padding(vertical = 8.dp),
                                        contentAlignment = Alignment.Center
                                    ) {
                                        Text(
                                            text = label,
                                            fontSize = 10.sp,
                                            fontWeight = FontWeight.Bold,
                                            color = if (isSelected) Color.White else TextSecondary
                                        )
                                    }
                                }
                            }

                            Spacer(modifier = Modifier.height(6.dp))

                            Row(
                                modifier = Modifier.fillMaxWidth(),
                                horizontalArrangement = Arrangement.spacedBy(6.dp)
                            ) {
                                categories.drop(3).forEach { (id, label) ->
                                    val isSelected = selectedCategory == id
                                    Box(
                                        modifier = Modifier
                                            .weight(1f)
                                            .clip(RoundedCornerShape(8.dp))
                                            .background(if (isSelected) BluePrimary else Color(0xFFF1F5F9))
                                            .clickable { selectedCategory = id }
                                            .padding(vertical = 8.dp),
                                        contentAlignment = Alignment.Center
                                    ) {
                                        Text(
                                            text = label,
                                            fontSize = 10.sp,
                                            fontWeight = FontWeight.Bold,
                                            color = if (isSelected) Color.White else TextSecondary
                                        )
                                    }
                                }
                            }

                            Spacer(modifier = Modifier.height(12.dp))

                            // Valor em R$
                            OutlinedTextField(
                                value = amountText,
                                onValueChange = { amountText = it.replace(",", ".") },
                                label = { Text("Valor (R$)", fontSize = 11.sp) },
                                placeholder = { Text("Ex: 50.00", fontSize = 11.sp) },
                                leadingIcon = {
                                    Icon(imageVector = Icons.Default.AttachMoney, contentDescription = null, tint = BluePrimary, modifier = Modifier.size(18.dp))
                                },
                                modifier = Modifier.fillMaxWidth(),
                                shape = RoundedCornerShape(10.dp),
                                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal),
                                singleLine = true
                            )

                            Spacer(modifier = Modifier.height(10.dp))

                            // Descrição / Estabelecimento
                            OutlinedTextField(
                                value = description,
                                onValueChange = { description = it },
                                label = { Text("Descrição / Estabelecimento", fontSize = 11.sp) },
                                placeholder = { Text("Ex: Posto BR Combustível", fontSize = 11.sp) },
                                modifier = Modifier.fillMaxWidth(),
                                shape = RoundedCornerShape(10.dp),
                                singleLine = true
                            )

                            Spacer(modifier = Modifier.height(12.dp))

                            // Botão de Foto do Comprovante
                            OutlinedButton(
                                onClick = {
                                    val (uri, file) = photoCaptureManager.createPhotoUri("EXPENSE", selectedCategory)
                                    currentPhotoFile = file
                                    cameraLauncher.launch(uri)
                                },
                                modifier = Modifier.fillMaxWidth().height(40.dp),
                                shape = RoundedCornerShape(10.dp)
                            ) {
                                Icon(
                                    imageVector = if (receiptPhotoPath != null) Icons.Default.CheckCircle else Icons.Default.CameraAlt,
                                    contentDescription = null,
                                    tint = if (receiptPhotoPath != null) Color(0xFF059669) else BluePrimary,
                                    modifier = Modifier.size(16.dp)
                                )
                                Spacer(modifier = Modifier.width(6.dp))
                                Text(
                                    text = if (receiptPhotoPath != null) "COMPROVANTE ANEXADO ✓" else "FOTOGRAFAR CUPOM FISCAL",
                                    fontSize = 11.sp,
                                    fontWeight = FontWeight.Bold,
                                    color = if (receiptPhotoPath != null) Color(0xFF059669) else BluePrimary
                                )
                            }

                            Spacer(modifier = Modifier.height(16.dp))

                            // Botão de Salvar
                            Button(
                                onClick = {
                                    val amount = amountText.toDoubleOrNull() ?: 0.0
                                    viewModel.addExpense(
                                        category = selectedCategory,
                                        amount = amount,
                                        description = description,
                                        photoPath = receiptPhotoPath
                                    )
                                },
                                modifier = Modifier.fillMaxWidth().height(46.dp),
                                shape = RoundedCornerShape(10.dp),
                                colors = ButtonDefaults.buttonColors(containerColor = BluePrimary)
                            ) {
                                Text(text = "SALVAR DESPESA NO APARELHO", fontWeight = FontWeight.Black, fontSize = 12.sp)
                            }
                        }
                    }
                    Spacer(modifier = Modifier.height(16.dp))
                }
            }

            // Título do Histórico
            item {
                Text(
                    text = "Histórico de Lançamentos",
                    fontWeight = FontWeight.Bold,
                    fontSize = 13.sp,
                    color = TextPrimary
                )
                Spacer(modifier = Modifier.height(8.dp))
            }

            if (uiState.expenses.isEmpty()) {
                item {
                    Box(
                        modifier = Modifier.fillMaxWidth().padding(32.dp),
                        contentAlignment = Alignment.Center
                    ) {
                        Text(
                            text = "Nenhuma despesa lançada nesta viagem.",
                            fontSize = 12.sp,
                            color = TextSecondary
                        )
                    }
                }
            } else {
                items(uiState.expenses, key = { it.id }) { exp ->
                    ExpenseCard(
                        expense = exp,
                        onDeleteClick = { viewModel.deleteExpense(exp.id) }
                    )
                }
            }
        }
    }
}

@Composable
fun ExpenseCard(
    expense: RouteExpenseEntity,
    onDeleteClick: () -> Unit
) {
    Card(
        modifier = Modifier
            .fillMaxWidth()
            .padding(vertical = 4.dp),
        shape = RoundedCornerShape(12.dp),
        colors = CardDefaults.cardColors(containerColor = Color.White),
        elevation = CardDefaults.cardElevation(defaultElevation = 1.dp)
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(14.dp),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically
        ) {
            Column(modifier = Modifier.weight(1f)) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Box(
                        modifier = Modifier
                            .clip(RoundedCornerShape(4.dp))
                            .background(Color(0xFFEFF6FF))
                            .padding(horizontal = 6.dp, vertical = 2.dp)
                    ) {
                        Text(
                            text = expense.category.uppercase(),
                            fontSize = 9.sp,
                            fontWeight = FontWeight.Black,
                            color = BluePrimary
                        )
                    }
                    Spacer(modifier = Modifier.width(6.dp))
                    Text(
                        text = expense.date,
                        fontSize = 10.sp,
                        color = TextSecondary
                    )
                }

                Spacer(modifier = Modifier.height(4.dp))

                Text(
                    text = expense.description,
                    fontSize = 12.sp,
                    fontWeight = FontWeight.Bold,
                    color = TextPrimary
                )
            }

            Column(horizontalAlignment = Alignment.End) {
                Text(
                    text = "R$ ${String.format(Locale.GERMANY, "%.2f", expense.amount)}",
                    fontSize = 14.sp,
                    fontWeight = FontWeight.Black,
                    color = Color(0xFF059669)
                )

                Spacer(modifier = Modifier.height(4.dp))

                Row(verticalAlignment = Alignment.CenterVertically) {
                    if (expense.receiptLocalPhotoPath != null) {
                        Icon(
                            imageVector = Icons.Default.Receipt,
                            contentDescription = "Cupom anexado",
                            tint = Color(0xFF059669),
                            modifier = Modifier.size(14.dp)
                        )
                        Spacer(modifier = Modifier.width(4.dp))
                    }

                    Icon(
                        imageVector = Icons.Default.DeleteOutline,
                        contentDescription = "Excluir",
                        tint = Color(0xFF94A3B8),
                        modifier = Modifier
                            .size(16.dp)
                            .clickable { onDeleteClick() }
                    )
                }
            }
        }
    }
}
