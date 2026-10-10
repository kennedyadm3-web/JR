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
     * Comprime a foto local mantendo ótima legibilidade técnica e prevenindo OutOfMemoryError no Android.
     */
    fun compressPhoto(photoFile: File): File {
        return try {
            if (!photoFile.exists()) return photoFile

            // 1. Decodifica primeiro apenas as dimensões para calcular o inSampleSize
            val options = BitmapFactory.Options().apply {
                inJustDecodeBounds = true
            }
            BitmapFactory.decodeFile(photoFile.absolutePath, options)

            val maxDimension = 1600
            val width = options.outWidth
            val height = options.outHeight

            var inSampleSize = 1
            if (width > maxDimension || height > maxDimension) {
                val halfWidth = width / 2
                val halfHeight = height / 2
                while ((halfWidth / inSampleSize) >= maxDimension || (halfHeight / inSampleSize) >= maxDimension) {
                    inSampleSize *= 2
                }
            }

            // 2. Decodifica o bitmap amostrado com menor pegada de memória RAM
            val decodeOptions = BitmapFactory.Options().apply {
                this.inSampleSize = inSampleSize
            }
            val bitmap = BitmapFactory.decodeFile(photoFile.absolutePath, decodeOptions) ?: return photoFile

            val outputStream = FileOutputStream(photoFile)
            bitmap.compress(Bitmap.CompressFormat.JPEG, 80, outputStream)
            outputStream.flush()
            outputStream.close()
            bitmap.recycle()

            photoFile
        } catch (t: Throwable) {
            photoFile
        }
    }

    /**
     * Copia e comprime uma foto selecionada da Galeria para o armazenamento local do app.
     */
    fun saveGalleryImageUri(sourceUri: Uri, orderId: String, equipmentId: String): File? {
        return try {
            val timeStamp = SimpleDateFormat("yyyyMMdd_HHmmss", Locale.getDefault()).format(Date())
            val storageDir = File(
                context.getExternalFilesDir(Environment.DIRECTORY_PICTURES),
                "ServicePhotos"
            )
            if (!storageDir.exists()) {
                storageDir.mkdirs()
            }
            val destFile = File(storageDir, "OS_${orderId}_EQ_${equipmentId}_${timeStamp}.jpg")

            context.contentResolver.openInputStream(sourceUri)?.use { input ->
                FileOutputStream(destFile).use { output ->
                    input.copyTo(output)
                }
            }
            compressPhoto(destFile)
        } catch (t: Throwable) {
            null
        }
    }
}
