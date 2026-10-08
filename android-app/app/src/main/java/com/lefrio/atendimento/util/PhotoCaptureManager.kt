package com.lefrio.atendimento.util

import android.content.Context
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.net.Uri
import android.os.Environment
import androidx.core.content.FileProvider
import java.io.File
import java.io.FileOutputStream
import java.text.SimpleDateFormat
import java.util.*

/**
 * Gerenciador de Captura e Armazenamento Seguro de Fotos Técnicas Locais.
 * Salva as fotos imediatamente no smartphone antes de qualquer envio de rede.
 */
class PhotoCaptureManager(private val context: Context) {

    /**
     * Cria um arquivo de foto temporário e retorna o Uri seguro via FileProvider para a Câmera nativa.
     */
    fun createPhotoUri(orderId: String, equipmentId: String): Pair<Uri, File> {
        val timeStamp = SimpleDateFormat("yyyyMMdd_HHmmss", Locale.getDefault()).format(Date())
        val storageDir = File(
            context.getExternalFilesDir(Environment.DIRECTORY_PICTURES),
            "ServicePhotos"
        )
        if (!storageDir.exists()) {
            storageDir.mkdirs()
        }

        val photoFile = File(storageDir, "OS_${orderId}_EQ_${equipmentId}_${timeStamp}.jpg")
        val uri = FileProvider.getUriForFile(
            context,
            "${context.packageName}.fileprovider",
            photoFile
        )

        return Pair(uri, photoFile)
    }

    /**
     * Comprime a foto local mantendo ótima legibilidade técnica e reduzindo o consumo de 4G.
     */
    fun compressPhoto(photoFile: File): File {
        return try {
            val bitmap = BitmapFactory.decodeFile(photoFile.absolutePath) ?: return photoFile
            val maxDimension = 1600
            val width = bitmap.width
            val height = bitmap.height

            val scale = if (width > maxDimension || height > maxDimension) {
                val ratio = width.toFloat() / height.toFloat()
                if (ratio > 1) {
                    maxDimension.toFloat() / width
                } else {
                    maxDimension.toFloat() / height
                }
            } else {
                1f
            }

            val scaledWidth = (width * scale).toInt()
            val scaledHeight = (height * scale).toInt()

            val scaledBitmap = Bitmap.createScaledBitmap(bitmap, scaledWidth, scaledHeight, true)
            val outputStream = FileOutputStream(photoFile)
            scaledBitmap.compress(Bitmap.CompressFormat.JPEG, 80, outputStream)
            outputStream.flush()
            outputStream.close()

            photoFile
        } catch (e: Exception) {
            photoFile
        }
    }
}
