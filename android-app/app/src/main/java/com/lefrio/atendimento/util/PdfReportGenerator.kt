package com.lefrio.atendimento.util

import android.content.Context
import android.graphics.*
import android.graphics.pdf.PdfDocument
import android.os.Environment
import androidx.core.content.FileProvider
import com.lefrio.atendimento.data.local.entity.EquipmentChecklistEntity
import com.lefrio.atendimento.data.local.entity.ServiceOrderEntity
import java.io.File
import java.io.FileOutputStream

class PdfReportGenerator(private val context: Context) {

    fun generateOrderPdf(
        order: ServiceOrderEntity,
        equipments: List<EquipmentChecklistEntity>
    ): File {
        val pdfDocument = PdfDocument()
        val pageInfo = PdfDocument.PageInfo.Builder(595, 842, 1).create() // A4 (595x842 pt)
        val page = pdfDocument.startPage(pageInfo)
        val canvas = page.canvas

        val paint = Paint().apply { isAntiAlias = true }

        // 1. Cabeçalho Corporativo LeFrio
        paint.color = android.graphics.Color.parseColor("#1E40AF")
        canvas.drawRect(0f, 0f, 595f, 70f, paint)

        paint.color = android.graphics.Color.WHITE
        paint.textSize = 18f
        paint.typeface = Typeface.create(Typeface.DEFAULT, Typeface.BOLD)
        canvas.drawText("LeFrio Refrigeração & Climatização", 30f, 38f, paint)

        paint.textSize = 10f
        paint.typeface = Typeface.DEFAULT
        canvas.drawText("Relatório Técnico Operacional de Atendimento", 30f, 54f, paint)

        paint.textSize = 14f
        paint.typeface = Typeface.create(Typeface.DEFAULT, Typeface.BOLD)
        canvas.drawText("O.S. #${order.osNumber}", 480f, 42f, paint)

        // 2. Dados do Cliente e Local
        var y = 95f
        paint.color = android.graphics.Color.parseColor("#0F172A")
        paint.textSize = 12f
        paint.typeface = Typeface.create(Typeface.DEFAULT, Typeface.BOLD)
        canvas.drawText("DADOS DO CLIENTE E ATENDIMENTO", 30f, y, paint)

        y += 6f
        paint.color = android.graphics.Color.parseColor("#E2E8F0")
        canvas.drawLine(30f, y, 565f, y, paint)

        y += 16f
        paint.textSize = 10f
        paint.color = android.graphics.Color.parseColor("#334155")
        paint.typeface = Typeface.DEFAULT
        canvas.drawText("Cliente: ${order.clientName}", 30f, y, paint)
        canvas.drawText("Tipo: ${order.type.uppercase()}", 350f, y, paint)

        y += 14f
        val address = "${order.addressStreet}${order.addressNumber?.let { ", $it" } ?: ""}${order.addressCity?.let { " - $it" } ?: ""}"
        canvas.drawText("Endereço: $address", 30f, y, paint)

        y += 14f
        canvas.drawText("Técnico: ${order.technicianName ?: "Técnico LeFrio"}", 30f, y, paint)
        canvas.drawText("Data de Conclusão: ${order.completionDate ?: "Hoje"}", 350f, y, paint)

        // Coordenadas GPS de Auditoria
        if (order.latitude != null && order.latitude != 0.0) {
            y += 14f
            paint.color = android.graphics.Color.parseColor("#059669")
            canvas.drawText(
                "Auditoria GPS: Lat ${String.format("%.5f", order.latitude)} / Long ${String.format("%.5f", order.longitude)} (Precisão: ${order.gpsAccuracy?.toInt() ?: 5}m)",
                30f,
                y,
                paint
            )
        }

        // 3. Tabela de Equipamentos Inspecionados
        y += 24f
        paint.color = android.graphics.Color.parseColor("#0F172A")
        paint.textSize = 12f
        paint.typeface = Typeface.create(Typeface.DEFAULT, Typeface.BOLD)
        canvas.drawText("EQUIPAMENTOS INSPECIONADOS (${equipments.size})", 30f, y, paint)

        y += 6f
        paint.color = android.graphics.Color.parseColor("#E2E8F0")
        canvas.drawLine(30f, y, 565f, y, paint)

        y += 14f
        paint.textSize = 9f
        paint.color = android.graphics.Color.parseColor("#64748B")
        paint.typeface = Typeface.create(Typeface.DEFAULT, Typeface.BOLD)
        canvas.drawText("EQUIPAMENTO / CAPACIDADE", 30f, y, paint)
        canvas.drawText("SETOR", 240f, y, paint)
        canvas.drawText("STATUS", 380f, y, paint)
        canvas.drawText("OBSERVAÇÕES", 470f, y, paint)

        y += 6f
        paint.color = android.graphics.Color.parseColor("#CBD5E1")
        canvas.drawLine(30f, y, 565f, y, paint)

        paint.typeface = Typeface.DEFAULT
        paint.textSize = 9f

        for (eq in equipments.take(8)) {
            y += 16f
            paint.color = android.graphics.Color.parseColor("#1E293B")
            val equipDesc = "${eq.equipmentName} ${eq.equipmentBtus?.let { "($it)" } ?: ""}"
            canvas.drawText(equipDesc.take(32), 30f, y, paint)
            canvas.drawText((eq.equipmentSector ?: "-").take(22), 240f, y, paint)

            if (eq.isChecked) {
                paint.color = android.graphics.Color.parseColor("#059669")
                canvas.drawText("EXECUTADO", 380f, y, paint)
            } else if (eq.isSkipped) {
                paint.color = android.graphics.Color.parseColor("#D97706")
                canvas.drawText("PENDÊNCIA", 380f, y, paint)
            } else {
                paint.color = android.graphics.Color.parseColor("#64748B")
                canvas.drawText("PENDENTE", 380f, y, paint)
            }

            paint.color = android.graphics.Color.parseColor("#475569")
            val obs = eq.justification?.takeIf { eq.isSkipped } ?: eq.notes
            canvas.drawText((if (obs.isBlank()) "OK" else obs).take(20), 470f, y, paint)
        }

        // 4. Seção de Assinatura do Cliente
        y = 660f
        paint.color = android.graphics.Color.parseColor("#E2E8F0")
        canvas.drawLine(30f, y, 565f, y, paint)

        y += 18f
        paint.color = android.graphics.Color.parseColor("#0F172A")
        paint.textSize = 11f
        paint.typeface = Typeface.create(Typeface.DEFAULT, Typeface.BOLD)
        canvas.drawText("ASSINATURA DIGITAL DO CLIENTE / RECEBEDOR", 30f, y, paint)

        y += 14f
        paint.textSize = 9f
        paint.color = android.graphics.Color.parseColor("#64748B")
        paint.typeface = Typeface.DEFAULT
        canvas.drawText("Recebedor: ${order.clientRepresentative ?: "Responsável"}", 30f, y, paint)
        canvas.drawText("Documento: ${order.clientSigneeDoc ?: "Não informado"}", 250f, y, paint)
        canvas.drawText("Data: ${order.signatureDate ?: order.completionDate ?: "Hoje"}", 430f, y, paint)

        // Desenha a imagem da assinatura se o arquivo existir
        order.signatureLocalPath?.let { sigPath ->
            try {
                val sigFile = File(sigPath)
                if (sigFile.exists()) {
                    val sigBitmap = BitmapFactory.decodeFile(sigFile.absolutePath)
                    if (sigBitmap != null) {
                        val destRect = RectF(30f, y + 10f, 230f, y + 80f)
                        canvas.drawBitmap(sigBitmap, null, destRect, null)
                    }
                }
            } catch (_: Exception) {}
        }

        // Linha para assinatura
        y += 85f
        paint.color = android.graphics.Color.parseColor("#94A3B8")
        canvas.drawLine(30f, y, 250f, y, paint)
        paint.textSize = 8f
        canvas.drawText("Assinatura do Responsável no Local", 30f, y + 12f, paint)

        // Rodapé de Compliance
        paint.textSize = 8f
        paint.color = android.graphics.Color.parseColor("#94A3B8")
        canvas.drawText("Documento gerado automaticamente pelo aplicativo LeFrio Atendimento. Assinado digitalmente com auditoria GPS.", 30f, 815f, paint)

        pdfDocument.finishPage(page)

        // Salva arquivo PDF no disco
        val storageDir = File(context.getExternalFilesDir(Environment.DIRECTORY_DOCUMENTS), "Reports")
        if (!storageDir.exists()) storageDir.mkdirs()

        val pdfFile = File(storageDir, "Relatorio_OS_${order.osNumber}.pdf")
        val outputStream = FileOutputStream(pdfFile)
        pdfDocument.writeTo(outputStream)
        outputStream.flush()
        outputStream.close()
        pdfDocument.close()

        return pdfFile
    }
}
