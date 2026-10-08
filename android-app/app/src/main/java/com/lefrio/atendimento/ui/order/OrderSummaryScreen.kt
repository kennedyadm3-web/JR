package com.lefrio.atendimento.ui.order

import android.content.Context
import android.content.Intent
import android.widget.Toast
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
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
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.core.content.FileProvider
import com.lefrio.atendimento.data.local.entity.EquipmentChecklistEntity
import com.lefrio.atendimento.data.local.entity.ServiceOrderEntity
import com.lefrio.atendimento.ui.theme.BluePrimary
import com.lefrio.atendimento.ui.theme.TextPrimary
import com.lefrio.atendimento.ui.theme.TextSecondary
import com.lefrio.atendimento.util.PdfReportGenerator
import java.io.File

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun OrderSummaryScreen(
    order: ServiceOrderEntity,
    equipments: List<EquipmentChecklistEntity>,
    onBackClick: () -> Unit
) {
    val context = LocalContext.current
    val pdfGenerator = remember { PdfReportGenerator(context) }
    var isGeneratingPdf by remember { mutableStateOf(false) }

    fun sharePdfReport() {
        isGeneratingPdf = true
        try {
            val pdfFile = pdfGenerator.generateOrderPdf(order, equipments)
            val uri = FileProvider.getUriForFile(
                context,
                "${context.packageName}.fileprovider",
                pdfFile
            )

            val shareIntent = Intent(Intent.ACTION_SEND).apply {
                type = "application/pdf"
                putExtra(Intent.EXTRA_STREAM, uri)
                putExtra(
                    Intent.EXTRA_SUBJECT,
                    "Relatório de Atendimento LeFrio - O.S. #${order.osNumber} - ${order.clientName}"
                )
                putExtra(
                    Intent.EXTRA_TEXT,
                    "Olá! Segue em anexo o Relatório Técnico de Atendimento da Ordem de Serviço #${order.osNumber} realizado pela LeFrio Refrigeração."
                )
                addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
            }

            context.startActivity(Intent.createChooser(shareIntent, "Compartilhar Relatório O.S. #${order.osNumber}"))
        } catch (e: Exception) {
            Toast.makeText(context, "Erro ao gerar PDF: ${e.message}", Toast.LENGTH_LONG).show()
        } finally {
            isGeneratingPdf = false
        }
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = {
                    Text(
                        text = "Comprovante O.S. #${order.osNumber}",
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
                actions = {
                    IconButton(onClick = { sharePdfReport() }) {
                        Icon(imageVector = Icons.Default.Share, contentDescription = "Compartilhar", tint = BluePrimary)
                    }
                },
                colors = TopAppBarDefaults.topAppBarColors(containerColor = Color.White)
            )
        },
        containerColor = Color(0xFFF8FAFC)
    ) { paddingValues ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(paddingValues)
                .verticalScroll(rememberScrollState())
                .padding(16.dp)
        ) {
            // Card Principal de Conclusão
            Card(
                modifier = Modifier.fillMaxWidth(),
                shape = RoundedCornerShape(16.dp),
                colors = CardDefaults.cardColors(containerColor = Color.White),
                elevation = CardDefaults.cardElevation(defaultElevation = 2.dp)
            ) {
                Column(modifier = Modifier.padding(18.dp)) {
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Text(
                            text = "ATENDIMENTO FINALIZADO",
                            fontWeight = FontWeight.Black,
                            fontSize = 11.sp,
                            color = Color(0xFF059669)
                        )
                        Box(
                            modifier = Modifier
                                .clip(RoundedCornerShape(6.dp))
                                .background(Color(0xFFD1FAE5))
                                .padding(horizontal = 8.dp, vertical = 4.dp)
                        ) {
                            Text(
                                text = "CONCLUÍDO",
                                fontWeight = FontWeight.Bold,
                                fontSize = 10.sp,
                                color = Color(0xFF059669)
                            )
                        }
                    }

                    Spacer(modifier = Modifier.height(10.dp))

                    Text(
                        text = order.clientName,
                        fontWeight = FontWeight.Black,
                        fontSize = 16.sp,
                        color = TextPrimary
                    )

                    val fullAddress = "${order.addressStreet}${order.addressNumber?.let { ", $it" } ?: ""}${order.addressCity?.let { " - $it" } ?: ""}"
                    Text(
                        text = fullAddress,
                        fontSize = 12.sp,
                        color = TextSecondary
                    )

                    Spacer(modifier = Modifier.height(12.dp))
                    Divider(color = Color(0xFFF1F5F9))
                    Spacer(modifier = Modifier.height(12.dp))

                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween
                    ) {
                        Column {
                            Text(text = "Data de Conclusão", fontSize = 10.sp, color = TextSecondary, fontWeight = FontWeight.Bold)
                            Text(text = order.completionDate ?: "Hoje", fontSize = 11.sp, fontWeight = FontWeight.SemiBold, color = TextPrimary)
                        }
                        Column(horizontalAlignment = Alignment.End) {
                            Text(text = "Técnico Responsável", fontSize = 10.sp, color = TextSecondary, fontWeight = FontWeight.Bold)
                            Text(text = order.technicianName ?: "Técnico", fontSize = 11.sp, fontWeight = FontWeight.SemiBold, color = TextPrimary)
                        }
                    }

                    if (order.latitude != null && order.latitude != 0.0) {
                        Spacer(modifier = Modifier.height(10.dp))
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Icon(imageVector = Icons.Default.LocationOn, contentDescription = null, tint = Color(0xFF059669), modifier = Modifier.size(14.dp))
                            Spacer(modifier = Modifier.width(4.dp))
                            Text(
                                text = "GPS: ${String.format("%.4f", order.latitude)}, ${String.format("%.4f", order.longitude)} (Precisão: ${order.gpsAccuracy?.toInt() ?: 5}m)",
                                fontSize = 10.sp,
                                color = Color(0xFF059669),
                                fontWeight = FontWeight.SemiBold
                            )
                        }
                    }
                }
            }

            Spacer(modifier = Modifier.height(14.dp))

            // Card da Assinatura do Cliente
            Card(
                modifier = Modifier.fillMaxWidth(),
                shape = RoundedCornerShape(16.dp),
                colors = CardDefaults.cardColors(containerColor = Color.White),
                elevation = CardDefaults.cardElevation(defaultElevation = 2.dp)
            ) {
                Column(modifier = Modifier.padding(18.dp)) {
                    Text(
                        text = "Assinatura do Recebedor",
                        fontWeight = FontWeight.Bold,
                        fontSize = 12.sp,
                        color = TextPrimary
                    )

                    Spacer(modifier = Modifier.height(4.dp))
                    Text(
                        text = "Recebedor: ${order.clientRepresentative ?: "Responsável"}",
                        fontSize = 11.sp,
                        fontWeight = FontWeight.SemiBold,
                        color = TextPrimary
                    )
                    Text(
                        text = "Documento: ${order.clientSigneeDoc ?: "Não informado"}",
                        fontSize = 11.sp,
                        color = TextSecondary
                    )

                    Spacer(modifier = Modifier.height(12.dp))

                    // Exibição da assinatura
                    val sigFile = order.signatureLocalPath?.let { File(it) }
                    if (sigFile != null && sigFile.exists()) {
                        val bitmap = android.graphics.BitmapFactory.decodeFile(sigFile.absolutePath)
                        if (bitmap != null) {
                            Box(
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .height(120.dp)
                                    .clip(RoundedCornerShape(10.dp))
                                    .background(Color(0xFFFAFAFA))
                                    .border(1.dp, Color(0xFFE2E8F0), RoundedCornerShape(10.dp)),
                                contentAlignment = Alignment.Center
                            ) {
                                Image(
                                    bitmap = bitmap.asImageBitmap(),
                                    contentDescription = "Assinatura do Cliente",
                                    modifier = Modifier.fillMaxSize().padding(8.dp),
                                    contentScale = ContentScale.Fit
                                )
                            }
                        }
                    }
                }
            }

            Spacer(modifier = Modifier.height(14.dp))

            // Resumo das Máquinas
            Card(
                modifier = Modifier.fillMaxWidth(),
                shape = RoundedCornerShape(16.dp),
                colors = CardDefaults.cardColors(containerColor = Color.White),
                elevation = CardDefaults.cardElevation(defaultElevation = 2.dp)
            ) {
                Column(modifier = Modifier.padding(18.dp)) {
                    Text(
                        text = "Equipamentos do Chamado (${equipments.size})",
                        fontWeight = FontWeight.Bold,
                        fontSize = 12.sp,
                        color = TextPrimary
                    )

                    Spacer(modifier = Modifier.height(10.dp))

                    equipments.forEach { eq ->
                        Row(
                            modifier = Modifier
                                .fillMaxWidth()
                                .padding(vertical = 4.dp),
                            horizontalArrangement = Arrangement.SpaceBetween,
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            Column(modifier = Modifier.weight(1f)) {
                                Text(
                                    text = eq.equipmentName,
                                    fontSize = 11.sp,
                                    fontWeight = FontWeight.Bold,
                                    color = TextPrimary
                                )
                                Text(
                                    text = "${eq.equipmentSector ?: "Geral"} • ${eq.equipmentBtus ?: ""}",
                                    fontSize = 10.sp,
                                    color = TextSecondary
                                )
                            }

                            Box(
                                modifier = Modifier
                                    .clip(RoundedCornerShape(4.dp))
                                    .background(if (eq.isChecked) Color(0xFFD1FAE5) else Color(0xFFFEF3C7))
                                    .padding(horizontal = 6.dp, vertical = 2.dp)
                            ) {
                                Text(
                                    text = if (eq.isChecked) "EXECUTADO" else "PENDÊNCIA",
                                    fontSize = 9.sp,
                                    fontWeight = FontWeight.Bold,
                                    color = if (eq.isChecked) Color(0xFF059669) else Color(0xFFD97706)
                                )
                            }
                        }
                        Divider(color = Color(0xFFF1F5F9), modifier = Modifier.padding(vertical = 4.dp))
                    }
                }
            }

            Spacer(modifier = Modifier.height(20.dp))

            // BOTÃO DE COMPARTILHAR PDF
            Button(
                onClick = { sharePdfReport() },
                modifier = Modifier
                    .fillMaxWidth()
                    .height(48.dp),
                shape = RoundedCornerShape(12.dp),
                colors = ButtonDefaults.buttonColors(containerColor = Color(0xFF059669)),
                enabled = !isGeneratingPdf
            ) {
                if (isGeneratingPdf) {
                    CircularProgressIndicator(color = Color.White, modifier = Modifier.size(20.dp), strokeWidth = 2.dp)
                } else {
                    Icon(imageVector = Icons.Default.PictureAsPdf, contentDescription = null, modifier = Modifier.size(18.dp))
                    Spacer(modifier = Modifier.width(8.dp))
                    Text(
                        text = "COMPARTILHAR RELATÓRIO PDF (WHATSAPP)",
                        fontWeight = FontWeight.Black,
                        fontSize = 12.sp,
                        letterSpacing = 0.5.sp
                    )
                }
            }

            Spacer(modifier = Modifier.height(10.dp))

            OutlinedButton(
                onClick = onBackClick,
                modifier = Modifier
                    .fillMaxWidth()
                    .height(44.dp),
                shape = RoundedCornerShape(12.dp)
            ) {
                Text(
                    text = "VOLTAR AO PAINEL",
                    fontSize = 11.sp,
                    fontWeight = FontWeight.Bold,
                    color = TextSecondary
                )
            }
        }
    }
}
