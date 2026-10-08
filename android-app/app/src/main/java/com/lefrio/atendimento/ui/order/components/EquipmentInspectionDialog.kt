package com.lefrio.atendimento.ui.order.components

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.window.Dialog
import com.lefrio.atendimento.data.local.entity.EquipmentChecklistEntity
import com.lefrio.atendimento.ui.theme.BluePrimary
import com.lefrio.atendimento.ui.theme.TextPrimary
import com.lefrio.atendimento.ui.theme.TextSecondary

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun EquipmentInspectionDialog(
    item: EquipmentChecklistEntity,
    onDismissRequest: () -> Unit,
    onSaveInspection: (isChecked: Boolean, isSkipped: Boolean, notes: String, justification: String?) -> Unit
) {
    var isExecutionSuccess by remember { mutableStateOf(!item.isSkipped) }
    var notes by remember { mutableStateOf(item.notes) }
    var justification by remember { mutableStateOf(item.justification ?: "") }

    // Itens operacionais de checagem
    var checkFiltros by remember { mutableStateOf(true) }
    var checkSerpentina by remember { mutableStateOf(true) }
    var checkEletrico by remember { mutableStateOf(true) }
    var checkDreno by remember { mutableStateOf(true) }
    var checkGas by remember { mutableStateOf(true) }

    Dialog(onDismissRequest = onDismissRequest) {
        Card(
            modifier = Modifier
                .fillMaxWidth()
                .padding(vertical = 16.dp),
            shape = RoundedCornerShape(20.dp),
            colors = CardDefaults.cardColors(containerColor = Color.White),
            elevation = CardDefaults.cardElevation(defaultElevation = 6.dp)
        ) {
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(20.dp)
                    .verticalScroll(rememberScrollState())
            ) {
                // Título
                Text(
                    text = "Checklist Técnico",
                    fontWeight = FontWeight.Black,
                    fontSize = 16.sp,
                    color = BluePrimary
                )
                Text(
                    text = item.equipmentName,
                    fontWeight = FontWeight.Bold,
                    fontSize = 12.sp,
                    color = TextPrimary
                )

                Spacer(modifier = Modifier.height(16.dp))

                // Seletor: Executado vs Não Executado
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .clip(RoundedCornerShape(10.dp))
                        .background(Color(0xFFF1F5F9))
                        .padding(4.dp)
                ) {
                    Box(
                        modifier = Modifier
                            .weight(1f)
                            .clip(RoundedCornerShape(8.dp))
                            .background(if (isExecutionSuccess) Color(0xFF059669) else Color.Transparent)
                            .clickable { isExecutionSuccess = true }
                            .padding(vertical = 8.dp),
                        contentAlignment = Alignment.Center
                    ) {
                        Text(
                            text = "CONCLUÍDO",
                            color = if (isExecutionSuccess) Color.White else TextSecondary,
                            fontWeight = FontWeight.Bold,
                            fontSize = 11.sp
                        )
                    }

                    Box(
                        modifier = Modifier
                            .weight(1f)
                            .clip(RoundedCornerShape(8.dp))
                            .background(if (!isExecutionSuccess) Color(0xFFD97706) else Color.Transparent)
                            .clickable { isExecutionSuccess = false }
                            .padding(vertical = 8.dp),
                        contentAlignment = Alignment.Center
                    ) {
                        Text(
                            text = "NÃO EXECUTADO",
                            color = if (!isExecutionSuccess) Color.White else TextSecondary,
                            fontWeight = FontWeight.Bold,
                            fontSize = 11.sp
                        )
                    }
                }

                Spacer(modifier = Modifier.height(16.dp))

                if (isExecutionSuccess) {
                    // Checkboxes dos testes operacionais
                    Text(
                        text = "Itens Inspecionados:",
                        fontWeight = FontWeight.Bold,
                        fontSize = 12.sp,
                        color = TextPrimary
                    )

                    Spacer(modifier = Modifier.height(6.dp))

                    ChecklistCheckboxItem("Limpeza de filtros e bandeja", checkFiltros) { checkFiltros = it }
                    ChecklistCheckboxItem("Higienização de serpentina", checkSerpentina) { checkSerpentina = it }
                    ChecklistCheckboxItem("Inspeção elétrica e fiação", checkEletrico) { checkEletrico = it }
                    ChecklistCheckboxItem("Teste de dreno e vazamentos", checkDreno) { checkDreno = it }
                    ChecklistCheckboxItem("Checagem de fluído / pressão", checkGas) { checkGas = it }

                    Spacer(modifier = Modifier.height(12.dp))

                    OutlinedTextField(
                        value = notes,
                        onValueChange = { notes = it },
                        label = { Text("Observações Técnicas (opcional)", fontSize = 11.sp) },
                        modifier = Modifier.fillMaxWidth(),
                        shape = RoundedCornerShape(10.dp),
                        maxLines = 3
                    )
                } else {
                    // Justificativa Obrigatória
                    Text(
                        text = "Justificativa da Pendência (obrigatório):",
                        fontWeight = FontWeight.Bold,
                        fontSize = 12.sp,
                        color = Color(0xFFB45309)
                    )

                    Spacer(modifier = Modifier.height(6.dp))

                    val quickJustifications = listOf(
                        "Sem acesso à sala/local",
                        "Equipamento desativado",
                        "Cliente solicitou adiar",
                        "Defeito elétrico pré-existente"
                    )

                    quickJustifications.forEach { qj ->
                        Row(
                            verticalAlignment = Alignment.CenterVertically,
                            modifier = Modifier
                                .fillMaxWidth()
                                .clickable { justification = qj }
                                .padding(vertical = 4.dp)
                        ) {
                            RadioButton(
                                selected = justification == qj,
                                onClick = { justification = qj }
                            )
                            Spacer(modifier = Modifier.width(4.dp))
                            Text(text = qj, fontSize = 11.sp, color = TextPrimary)
                        }
                    }

                    Spacer(modifier = Modifier.height(6.dp))

                    OutlinedTextField(
                        value = justification,
                        onValueChange = { justification = it },
                        placeholder = { Text("Ou digite o motivo detalhado...", fontSize = 11.sp) },
                        modifier = Modifier.fillMaxWidth(),
                        shape = RoundedCornerShape(10.dp),
                        maxLines = 3
                    )
                }

                Spacer(modifier = Modifier.height(20.dp))

                // Botão de Gravar
                Button(
                    onClick = {
                        val isChecked = isExecutionSuccess
                        val isSkipped = !isExecutionSuccess
                        onSaveInspection(isChecked, isSkipped, notes, justification.takeIf { isSkipped })
                        onDismissRequest()
                    },
                    modifier = Modifier
                        .fillMaxWidth()
                        .height(46.dp),
                    shape = RoundedCornerShape(12.dp),
                    colors = ButtonDefaults.buttonColors(containerColor = BluePrimary),
                    enabled = isExecutionSuccess || justification.isNotBlank()
                ) {
                    Text(
                        text = "SALVAR NO APARELHO",
                        fontWeight = FontWeight.Black,
                        fontSize = 12.sp
                    )
                }
            }
        }
    }
}

@Composable
fun ChecklistCheckboxItem(
    label: String,
    checked: Boolean,
    onCheckedChange: (Boolean) -> Unit
) {
    Row(
        verticalAlignment = Alignment.CenterVertically,
        modifier = Modifier
            .fillMaxWidth()
            .clickable { onCheckedChange(!checked) }
            .padding(vertical = 2.dp)
    ) {
        Checkbox(
            checked = checked,
            onCheckedChange = onCheckedChange,
            colors = CheckboxDefaults.colors(checkedColor = Color(0xFF059669))
        )
        Spacer(modifier = Modifier.width(6.dp))
        Text(text = label, fontSize = 11.sp, color = TextPrimary)
    }
}
