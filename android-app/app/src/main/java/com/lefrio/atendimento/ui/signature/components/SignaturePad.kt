package com.lefrio.atendimento.ui.signature.components

import android.content.Context
import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.Paint
import android.os.Environment
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.gestures.awaitEachGesture
import androidx.compose.foundation.gestures.awaitFirstDown
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.StrokeJoin
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.input.pointer.PointerEventPass
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.lefrio.atendimento.ui.theme.TextSecondary
import java.io.File
import java.io.FileOutputStream
import java.text.SimpleDateFormat
import java.util.*

class SignaturePath(
    val path: Path = Path(),
    val points: MutableList<Offset> = mutableListOf()
)

@Composable
fun SignaturePad(
    modifier: Modifier = Modifier,
    paths: MutableList<SignaturePath>,
    onSignatureChanged: (hasSignature: Boolean) -> Unit,
    onDrawingActiveChanged: ((isActive: Boolean) -> Unit)? = null
) {
    var drawCounter by remember { mutableIntStateOf(0) }

    Box(
        modifier = modifier
            .clip(RoundedCornerShape(14.dp))
            .background(Color.White)
            .border(2.dp, Color(0xFFCBD5E1), RoundedCornerShape(14.dp))
    ) {
        Canvas(
            modifier = Modifier
                .fillMaxSize()
                .pointerInput(Unit) {
                    awaitEachGesture {
                        // Pass.Initial intercepta ANTES do verticalScroll do Scaffold/Column pai
                        val down = awaitFirstDown(pass = PointerEventPass.Initial, requireUnconsumed = false)
                        down.consume()
                        onDrawingActiveChanged?.invoke(true)

                        val newPath = SignaturePath()
                        newPath.path.moveTo(down.position.x, down.position.y)
                        newPath.points.add(down.position)
                        paths.add(newPath)
                        drawCounter++
                        onSignatureChanged(true)

                        var lastPoint = down.position

                        while (true) {
                            val event = awaitPointerEvent(pass = PointerEventPass.Initial)
                            val pointer = event.changes.firstOrNull { it.id == down.id } ?: break

                            if (!pointer.pressed) {
                                pointer.consume()
                                onDrawingActiveChanged?.invoke(false)
                                break
                            }

                            // Consome imediatamente no Pass.Initial para neutralizar qualquer interferência do scroll pai
                            pointer.consume()

                            val currentPos = pointer.position
                            val midX = (lastPoint.x + currentPos.x) / 2f
                            val midY = (lastPoint.y + currentPos.y) / 2f

                            // Curva Bézier quadrática contínua para máxima fluidez do dedo na tela
                            newPath.path.quadraticBezierTo(lastPoint.x, lastPoint.y, midX, midY)
                            newPath.points.add(currentPos)
                            lastPoint = currentPos
                            drawCounter++
                        }

                        // Se foi um toque curto (ponto / acento / pingo no 'i'), garante traçado visível
                        if (newPath.points.size == 1) {
                            newPath.path.lineTo(lastPoint.x + 0.8f, lastPoint.y + 0.8f)
                            drawCounter++
                        }
                    }
                }
        ) {
            // Linha guia de assinatura
            val lineY = size.height * 0.78f
            drawLine(
                color = Color(0xFFE2E8F0),
                start = Offset(24f, lineY),
                end = Offset(size.width - 24f, lineY),
                strokeWidth = 2f
            )

            // Força recomposição do canvas ao atualizar drawCounter
            @Suppress("UNUSED_EXPRESSION")
            drawCounter

            // Desenha todos os traços com traço esferográfico encorpado e suave
            for (p in paths) {
                drawPath(
                    path = p.path,
                    color = Color(0xFF0F172A),
                    style = Stroke(
                        width = 6f,
                        cap = StrokeCap.Round,
                        join = StrokeJoin.Round
                    )
                )
            }
        }

        // Dica visual se estiver vazio
        if (paths.isEmpty()) {
            Box(
                modifier = Modifier
                    .fillMaxSize()
                    .padding(bottom = 32.dp),
                contentAlignment = Alignment.Center
            ) {
                Text(
                    text = "✍️ Assine com o dedo ou caneta nesta área",
                    color = TextSecondary.copy(alpha = 0.6f),
                    fontSize = 13.sp
                )
            }
        }

        // Botão Limpar Traço no canto inferior
        if (paths.isNotEmpty()) {
            OutlinedButton(
                onClick = {
                    paths.clear()
                    drawCounter++
                    onSignatureChanged(false)
                },
                modifier = Modifier
                    .align(Alignment.BottomEnd)
                    .padding(10.dp)
                    .height(32.dp),
                contentPadding = PaddingValues(horizontal = 8.dp, vertical = 4.dp),
                shape = RoundedCornerShape(8.dp)
            ) {
                Icon(
                    imageVector = Icons.Default.Delete,
                    contentDescription = null,
                    tint = Color(0xFFDC2626),
                    modifier = Modifier.size(14.dp)
                )
                Spacer(modifier = Modifier.width(4.dp))
                Text(
                    text = "LIMPAR",
                    fontSize = 10.sp,
                    color = Color(0xFFDC2626)
                )
            }
        }
    }
}

/**
 * Salva os traços em um arquivo Bitmap PNG local no armazenamento do smartphone.
 */
fun saveSignatureToLocalFile(
    context: Context,
    paths: List<SignaturePath>,
    width: Int = 800,
    height: Int = 400,
    orderId: String
): File {
    val bitmap = Bitmap.createBitmap(width, height, Bitmap.Config.ARGB_8888)
    val canvas = Canvas(bitmap)

    // Fundo branco sólido
    canvas.drawColor(android.graphics.Color.WHITE)

    val paint = Paint().apply {
        color = android.graphics.Color.BLACK
        strokeWidth = 6f
        style = Paint.Style.STROKE
        strokeCap = Paint.Cap.ROUND
        strokeJoin = Paint.Join.ROUND
        isAntiAlias = true
    }

    for (p in paths) {
        val androidPath = android.graphics.Path()
        if (p.points.isNotEmpty()) {
            if (p.points.size == 1) {
                canvas.drawCircle(p.points[0].x, p.points[0].y, 3f, Paint().apply {
                    color = android.graphics.Color.BLACK
                    style = Paint.Style.FILL
                    isAntiAlias = true
                })
            } else {
                androidPath.moveTo(p.points[0].x, p.points[0].y)
                for (i in 1 until p.points.size) {
                    val prev = p.points[i - 1]
                    val curr = p.points[i]
                    val midX = (prev.x + curr.x) / 2f
                    val midY = (prev.y + curr.y) / 2f
                    androidPath.quadTo(prev.x, prev.y, midX, midY)
                }
                androidPath.lineTo(p.points.last().x, p.points.last().y)
                canvas.drawPath(androidPath, paint)
            }
        }
    }

    val dir = File(context.getExternalFilesDir(Environment.DIRECTORY_PICTURES), "Signatures")
    if (!dir.exists()) dir.mkdirs()

    val timeStamp = SimpleDateFormat("yyyyMMdd_HHmmss", Locale.getDefault()).format(Date())
    val file = File(dir, "SIG_OS_${orderId}_$timeStamp.png")

    val fos = FileOutputStream(file)
    bitmap.compress(Bitmap.CompressFormat.PNG, 100, fos)
    fos.flush()
    fos.close()

    return file
}

/**
 * Converte um arquivo de assinatura em string Base64 no formato data URI (data:image/png;base64,...)
 * para compatibilidade total e visualização imediata no painel administrativo e PWA.
 */
fun convertFileToBase64(file: File): String? {
    return try {
        if (!file.exists() || file.length() == 0L) return null
        val bytes = file.readBytes()
        val base64 = android.util.Base64.encodeToString(bytes, android.util.Base64.NO_WRAP)
        "data:image/png;base64,$base64"
    } catch (e: Exception) {
        null
    }
}
