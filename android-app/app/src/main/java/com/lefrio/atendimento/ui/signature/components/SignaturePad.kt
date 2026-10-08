package com.lefrio.atendimento.ui.signature.components

import android.content.Context
import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.Paint
import android.os.Environment
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.gestures.detectDragGestures
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
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.lefrio.atendimento.ui.theme.BluePrimary
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
    onSignatureChanged: (hasSignature: Boolean) -> Unit
) {
    var currentPath by remember { mutableStateOf<SignaturePath?>(null) }
    var drawCounter by remember { mutableIntStateOf(0) }

    Box(
        modifier = modifier
            .clip(RoundedCornerShape(12.dp))
            .background(Color(0xFFFAFAFA))
            .border(1.5.dp, Color(0xFFCBD5E1), RoundedCornerShape(12.dp))
    ) {
        Canvas(
            modifier = Modifier
                .fillMaxSize()
                .pointerInput(Unit) {
                    detectDragGestures(
                        onDragStart = { offset ->
                            val newPath = SignaturePath()
                            newPath.path.moveTo(offset.x, offset.y)
                            newPath.points.add(offset)
                            currentPath = newPath
                            paths.add(newPath)
                            drawCounter++
                            onSignatureChanged(true)
                        },
                        onDrag = { change, _ ->
                            currentPath?.let {
                                it.path.lineTo(change.position.x, change.position.y)
                                it.points.add(change.position)
                                drawCounter++
                            }
                        },
                        onDragEnd = {
                            currentPath = null
                            drawCounter++
                        }
                    )
                }
        ) {
            // Linha guia de assinatura
            val lineY = size.height * 0.78f
            drawLine(
                color = Color(0xFFCBD5E1),
                start = Offset(24f, lineY),
                end = Offset(size.width - 24f, lineY),
                strokeWidth = 2f
            )

            // Desenha todos os traços feitos
            for (p in paths) {
                drawPath(
                    path = p.path,
                    color = Color(0xFF0F172A),
                    style = Stroke(
                        width = 4.5f,
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
        strokeWidth = 5f
        style = Paint.Style.STROKE
        strokeCap = Paint.Cap.ROUND
        strokeJoin = Paint.Join.ROUND
        isAntiAlias = true
    }

    for (p in paths) {
        val androidPath = android.graphics.Path()
        if (p.points.isNotEmpty()) {
            androidPath.moveTo(p.points[0].x, p.points[0].y)
            for (i in 1 until p.points.size) {
                androidPath.lineTo(p.points[i].x, p.points[i].y)
            }
            canvas.drawPath(androidPath, paint)
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
