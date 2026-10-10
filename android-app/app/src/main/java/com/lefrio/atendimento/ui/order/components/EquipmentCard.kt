package com.lefrio.atendimento.ui.order.components

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.expandVertically
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.shrinkVertically
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import coil.compose.AsyncImage
import com.lefrio.atendimento.data.local.entity.EquipmentChecklistEntity
import com.lefrio.atendimento.ui.theme.*
import java.io.File

/**
 * Card expansível de equipamento para Atendimento Preventivo / PMOC.
 * Segue fielmente o padrão moderno do sistema PWA:
 * 1. Cada máquina é um card com número, setor, marca e BTUs.
 * 2. Botão rápido "Atender" no resumo para preencher imediatamente sem expandir.
 * 3. Botão rápido de Câmera para anexar foto de evidência.
 * 4. Ao tocar no card, expande inline revelando itens de checklist e fotos.
 */
@Composable
fun EquipmentCard(
    orderIndex: Int,
    item: EquipmentChecklistEntity,
    photos: List<String>,
    onToggleAttend: () -> Unit,
    onToggleSkip: () -> Unit,
    onTakePhotoClick: () -> Unit,
    onDeletePhotoClick: (String) -> Unit,
    onSaveNotes: (String) -> Unit,
    isOrderCompleted: Boolean = false
) {
    var isExpanded by remember { mutableStateOf(false) }
    var notesText by remember(item.notes) { mutableStateOf(item.notes) }

    // Itens individuais do checklist PMOC
    var checkFiltros by remember(item.isChecked) { mutableStateOf(item.isChecked) }
    var checkSerpentina by remember(item.isChecked) { mutableStateOf(item.isChecked) }
    var checkDreno by remember(item.isChecked) { mutableStateOf(item.isChecked) }
    var checkEletrico by remember(item.isChecked) { mutableStateOf(item.isChecked) }
    var checkRuido by remember(item.isChecked) { mutableStateOf(item.isChecked) }
    var checkTemp by remember(item.isChecked) { mutableStateOf(item.isChecked) }

    // Cores dinâmicas de borda e status conforme estado
    val borderColor = when {
        item.isChecked -> Color(0xFF6EE7B7) // emerald-300
        item.isSkipped -> Color(0xFFFCD34D) // amber-300
        else -> Color(0xFFE2E8F0) // slate-200
    }

    val badgeBgColor = when {
        item.isChecked -> Color(0xFF059669) // emerald-600
        item.isSkipped -> Color(0xFFD97706) // amber-600
        else -> Color(0xFF0284C7) // sky-600
    }

    Card(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = 14.dp, vertical = 5.dp)
            .border(
                width = if (item.isChecked || item.isSkipped) 1.5.dp else 1.dp,
                color = borderColor,
                shape = RoundedCornerShape(14.dp)
            ),
        shape = RoundedCornerShape(14.dp),
        colors = CardDefaults.cardColors(containerColor = Color.White),
        elevation = CardDefaults.cardElevation(defaultElevation = 1.dp)
    ) {
        Column(modifier = Modifier.fillMaxWidth()) {

            // CABEÇALHO CLICÁVEL (ao clicar expande/recolhe inline)
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .clickable { isExpanded = !isExpanded }
                    .background(if (isExpanded) Color(0xFFF8FAFC) else Color.White)
                    .padding(horizontal = 12.dp, vertical = 10.dp)
            ) {
                // LINHA 1: Selo com número de ordem + Setor em destaque + BTUs
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    verticalAlignment = Alignment.Top
                ) {
                    // Badge número de ordenamento da máquina (ex: 1, 2, 3...)
                    Box(
                        modifier = Modifier
                            .size(30.dp)
                            .clip(RoundedCornerShape(8.dp))
                            .background(badgeBgColor),
                        contentAlignment = Alignment.Center
                    ) {
                        Text(
                            text = "$orderIndex",
                            color = Color.White,
                            fontWeight = FontWeight.Black,
                            fontSize = 13.sp
                        )
                    }

                    Spacer(modifier = Modifier.width(10.dp))

                    // Bloco de Identificação
                    Column(modifier = Modifier.weight(1f)) {
                        // SETOR COMO TEXTO PRINCIPAL
                        Text(
                            text = (item.equipmentSector ?: "Ambiente / Geral").uppercase(),
                            fontSize = 13.sp,
                            fontWeight = FontWeight.Black,
                            color = TextPrimary,
                            letterSpacing = 0.3.sp
                        )

                        Spacer(modifier = Modifier.height(2.dp))

                        // Nome do Equipamento + Marca + Potência
                        Row(
                            verticalAlignment = Alignment.CenterVertically,
                            modifier = Modifier.fillMaxWidth()
                        ) {
                            val equipText = buildString {
                                append(item.equipmentName)
                                if (!item.equipmentBrand.isNullOrBlank()) {
                                    append(" - ")
                                    append(item.equipmentBrand)
                                }
                            }

                            Text(
                                text = equipText,
                                fontSize = 11.sp,
                                fontWeight = FontWeight.SemiBold,
                                color = TextSecondary,
                                modifier = Modifier.weight(1f, fill = false)
                            )

                            if (!item.equipmentBtus.isNullOrBlank()) {
                                Spacer(modifier = Modifier.width(6.dp))
                                Box(
                                    modifier = Modifier
                                        .clip(RoundedCornerShape(6.dp))
                                        .background(Color(0xFFE0F2FE))
                                        .padding(horizontal = 6.dp, vertical = 2.dp)
                                ) {
                                    Text(
                                        text = "${item.equipmentBtus} BTUs",
                                        fontSize = 10.sp,
                                        fontWeight = FontWeight.Bold,
                                        color = Color(0xFF0369A1)
                                    )
                                }
                            }
                        }

                        if (!item.equipmentPatrimony.isNullOrBlank()) {
                            Text(
                                text = "Patr: ${item.equipmentPatrimony}",
                                fontSize = 10.sp,
                                color = TextSecondary
                            )
                        }
                    }
                }

                Spacer(modifier = Modifier.height(8.dp))

                // LINHA 2: AÇÕES RÁPIDAS (Atender, Pular, Foto, Expandir)
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    // Lado Esquerdo: Botões Atender e Pular
                    Row(
                        horizontalArrangement = Arrangement.spacedBy(6.dp),
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        // Botão Atender / Atendida
                        Button(
                            onClick = onToggleAttend,
                            enabled = !isOrderCompleted,
                            shape = RoundedCornerShape(8.dp),
                            colors = ButtonDefaults.buttonColors(
                                containerColor = if (item.isChecked) Color(0xFF059669) else Color(0xFFF1F5F9),
                                contentColor = if (item.isChecked) Color.White else Color(0xFF334155)
                            ),
                            contentPadding = PaddingValues(horizontal = 10.dp, vertical = 4.dp),
                            modifier = Modifier.height(30.dp)
                        ) {
                            Icon(
                                imageVector = Icons.Default.Check,
                                contentDescription = null,
                                modifier = Modifier.size(13.dp),
                                tint = if (item.isChecked) Color.White else Color(0xFF059669)
                            )
                            Spacer(modifier = Modifier.width(4.dp))
                            Text(
                                text = if (item.isChecked) "Atendida" else "Atender",
                                fontSize = 11.sp,
                                fontWeight = FontWeight.Black
                            )
                        }

                        // Botão Pular
                        Button(
                            onClick = onToggleSkip,
                            enabled = !isOrderCompleted,
                            shape = RoundedCornerShape(8.dp),
                            colors = ButtonDefaults.buttonColors(
                                containerColor = if (item.isSkipped) Color(0xFFD97706) else Color(0xFFF8FAFC),
                                contentColor = if (item.isSkipped) Color.White else Color(0xFF64748B)
                            ),
                            contentPadding = PaddingValues(horizontal = 8.dp, vertical = 4.dp),
                            modifier = Modifier.height(30.dp)
                        ) {
                            Text(
                                text = if (item.isSkipped) "Pulada" else "Pular",
                                fontSize = 11.sp,
                                fontWeight = FontWeight.Bold
                            )
                        }
                    }

                    // Lado Direito: Câmera rápida e Chevron
                    Row(
                        horizontalArrangement = Arrangement.spacedBy(6.dp),
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        // Botão Câmera Rápida (para tirar foto sem expandir)
                        OutlinedButton(
                            onClick = onTakePhotoClick,
                            enabled = !isOrderCompleted,
                            shape = RoundedCornerShape(8.dp),
                            colors = ButtonDefaults.outlinedButtonColors(
                                containerColor = if (photos.isNotEmpty()) Color(0xFFEFF6FF) else Color(0xFFF8FAFC)
                            ),
                            contentPadding = PaddingValues(horizontal = 8.dp, vertical = 4.dp),
                            modifier = Modifier.height(30.dp)
                        ) {
                            Icon(
                                imageVector = Icons.Default.CameraAlt,
                                contentDescription = "Tirar foto",
                                tint = if (photos.isNotEmpty()) BluePrimary else Color(0xFF64748B),
                                modifier = Modifier.size(14.dp)
                            )
                            if (photos.isNotEmpty()) {
                                Spacer(modifier = Modifier.width(4.dp))
                                Text(
                                    text = "${photos.size}",
                                    fontSize = 10.sp,
                                    fontWeight = FontWeight.Black,
                                    color = BluePrimary
                                )
                            }
                        }

                        // Seta Chevron (expandir / recolher)
                        IconButton(
                            onClick = { isExpanded = !isExpanded },
                            modifier = Modifier.size(30.dp)
                        ) {
                            Icon(
                                imageVector = if (isExpanded) Icons.Default.KeyboardArrowUp else Icons.Default.KeyboardArrowDown,
                                contentDescription = if (isExpanded) "Recolher" else "Expandir",
                                tint = Color(0xFF94A3B8),
                                modifier = Modifier.size(20.dp)
                            )
                        }
                    }
                }
            }

            // CORPO EXPANDIDO INLINE (sem abrir nova janela/dialog!)
            AnimatedVisibility(
                visible = isExpanded,
                enter = expandVertically() + fadeIn(),
                exit = shrinkVertically() + fadeOut()
            ) {
                Column(
                    modifier = Modifier
                        .fillMaxWidth()
                        .background(Color(0xFFFAFAFA))
                        .padding(horizontal = 14.dp, vertical = 12.dp)
                ) {
                    HorizontalDivider(color = Color(0xFFE2E8F0), thickness = 1.dp)
                    Spacer(modifier = Modifier.height(10.dp))

                    Text(
                        text = "ITENS DO CHECKLIST TÉCNICO",
                        fontSize = 10.sp,
                        fontWeight = FontWeight.Black,
                        color = Color(0xFF64748B),
                        letterSpacing = 0.5.sp
                    )

                    Spacer(modifier = Modifier.height(6.dp))

                    // Checklist de Verificação Técnica PMOC
                    ChecklistRowItem(
                        label = "Limpeza de filtros e bandeja de condensado",
                        checked = checkFiltros,
                        onCheckedChange = { checkFiltros = it }
                    )
                    ChecklistRowItem(
                        label = "Higienização da serpentina evaporadora",
                        checked = checkSerpentina,
                        onCheckedChange = { checkSerpentina = it }
                    )
                    ChecklistRowItem(
                        label = "Inspeção do dreno e teste de escoamento",
                        checked = checkDreno,
                        onCheckedChange = { checkDreno = it }
                    )
                    ChecklistRowItem(
                        label = "Revisão das conexões elétricas e bornes",
                        checked = checkEletrico,
                        onCheckedChange = { checkEletrico = it }
                    )
                    ChecklistRowItem(
                        label = "Verificação de ruídos e vibrações anormais",
                        checked = checkRuido,
                        onCheckedChange = { checkRuido = it }
                    )
                    ChecklistRowItem(
                        label = "Aferição de temperatura e fluxo de ar",
                        checked = checkTemp,
                        onCheckedChange = { checkTemp = it }
                    )

                    Spacer(modifier = Modifier.height(10.dp))

                    // Campo de Observações
                    OutlinedTextField(
                        value = notesText,
                        onValueChange = {
                            notesText = it
                            onSaveNotes(it)
                        },
                        label = { Text("Observações Técnicas desta Máquina", fontSize = 11.sp) },
                        placeholder = { Text("Ex: Filtro trocado, carga de gás ok...", fontSize = 11.sp) },
                        modifier = Modifier.fillMaxWidth(),
                        shape = RoundedCornerShape(10.dp),
                        colors = OutlinedTextFieldDefaults.colors(
                            focusedContainerColor = Color.White,
                            unfocusedContainerColor = Color.White
                        ),
                        singleLine = false,
                        maxLines = 2
                    )

                    // Seção de Fotos Anexadas desta máquina
                    if (photos.isNotEmpty()) {
                        Spacer(modifier = Modifier.height(12.dp))
                        Text(
                            text = "FOTOS DE EVIDÊNCIA (${photos.size}):",
                            fontSize = 10.sp,
                            fontWeight = FontWeight.Bold,
                            color = Color(0xFF64748B)
                        )
                        Spacer(modifier = Modifier.height(6.dp))

                        LazyRow(
                            horizontalArrangement = Arrangement.spacedBy(8.dp),
                            modifier = Modifier.fillMaxWidth()
                        ) {
                            items(photos) { photoPath ->
                                Box(
                                    modifier = Modifier
                                        .size(68.dp)
                                        .clip(RoundedCornerShape(8.dp))
                                        .background(Color(0xFFE2E8F0))
                                ) {
                                    AsyncImage(
                                        model = File(photoPath),
                                        contentDescription = "Foto da máquina",
                                        modifier = Modifier.fillMaxSize(),
                                        contentScale = ContentScale.Crop
                                    )
                                    // Botão de deletar miniatura
                                    Box(
                                        modifier = Modifier
                                            .align(Alignment.TopEnd)
                                            .size(20.dp)
                                            .clip(CircleShape)
                                            .background(Color.Black.copy(alpha = 0.65f))
                                            .clickable { onDeletePhotoClick(photoPath) },
                                        contentAlignment = Alignment.Center
                                    ) {
                                        Icon(
                                            imageVector = Icons.Default.Close,
                                            contentDescription = "Remover",
                                            tint = Color.White,
                                            modifier = Modifier.size(12.dp)
                                        )
                                    }
                                }
                            }
                        }
                    }

                    Spacer(modifier = Modifier.height(10.dp))

                    // Botão para anexar mais foto dentro do card expandido
                    OutlinedButton(
                        onClick = onTakePhotoClick,
                        enabled = !isOrderCompleted,
                        shape = RoundedCornerShape(8.dp),
                        modifier = Modifier.fillMaxWidth()
                    ) {
                        Icon(
                            imageVector = Icons.Default.CameraAlt,
                            contentDescription = null,
                            tint = BluePrimary,
                            modifier = Modifier.size(15.dp)
                        )
                        Spacer(modifier = Modifier.width(6.dp))
                        Text(
                            text = "ANEXAR FOTO DESTA MÁQUINA",
                            fontSize = 11.sp,
                            fontWeight = FontWeight.Bold,
                            color = BluePrimary
                        )
                    }
                }
            }
        }
    }
}

@Composable
private fun ChecklistRowItem(
    label: String,
    checked: Boolean,
    onCheckedChange: (Boolean) -> Unit
) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clickable { onCheckedChange(!checked) }
            .padding(vertical = 3.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        Checkbox(
            checked = checked,
            onCheckedChange = onCheckedChange,
            colors = CheckboxDefaults.colors(
                checkedColor = Color(0xFF059669),
                uncheckedColor = Color(0xFF94A3B8)
            ),
            modifier = Modifier.size(24.dp)
        )
        Spacer(modifier = Modifier.width(8.dp))
        Text(
            text = label,
            fontSize = 11.sp,
            color = if (checked) Color(0xFF1E293B) else Color(0xFF64748B),
            fontWeight = if (checked) FontWeight.SemiBold else FontWeight.Normal
        )
    }
}
