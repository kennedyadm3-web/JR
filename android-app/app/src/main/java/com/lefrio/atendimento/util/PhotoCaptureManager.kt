package com.lefrio.atendimento.util

import android.content.Context
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.net.Uri
import android.os.Environment
import android.util.Log
import androidx.core.content.FileProvider
import com.lefrio.atendimento.data.local.AppDatabase
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import org.json.JSONArray
import org.json.JSONObject
import java.io.File
import java.io.FileOutputStream
import java.text.SimpleDateFormat
import java.util.*

/**
 * Gerenciador de Captura, Pré-Compressão Única e Higiene Automática de Fotos Técnicas Locais.
 * - Comprime a foto já na dimensão otimizada de envio (720px, JPEG 60%) na captura para evitar picos de CPU/RAM pós-offline.
 * - Remove automaticamente arquivos locais de atendimentos já sincronizados há mais de 7 dias (preservando 100% das pendências).
 */
class PhotoCaptureManager(private val context: Context) {

    companion object {
        private const val TAG = "PhotoCaptureManager"
        private const val CAPTURE_MAX_DIMENSION = 720
        private const val CAPTURE_JPEG_QUALITY = 60
        private const val FAST_PATH_MAX_FILE_BYTES = 115_000L
        private const val CLEANUP_PREFS = "lefrio_media_cleanup_prefs"
        private const val KEY_LAST_CLEANUP_AT = "last_cleanup_at_ms"
        private const val CLEANUP_INTERVAL_MS = 24L * 60L * 60L * 1000L // 24 horas
        private const val RETENTION_MS = 7L * 24L * 60L * 60L * 1000L   // 7 dias

        /**
         * Remove fotos e assinaturas locais com mais de 7 dias pertencentes a atendimentos já sincronizados.
         * Nunca remove nenhum arquivo vinculado a ordens não sincronizadas, checklists pendentes ou itens na fila sync_queue.
         */
        suspend fun cleanupOldSyncedMediaIfDue(context: Context, force: Boolean = false): Int = withContext(Dispatchers.IO) {
            val prefs = context.getSharedPreferences(CLEANUP_PREFS, Context.MODE_PRIVATE)
            val now = System.currentTimeMillis()
            val lastCleanup = prefs.getLong(KEY_LAST_CLEANUP_AT, 0L)
            if (!force && (now - lastCleanup) < CLEANUP_INTERVAL_MS) {
                return@withContext 0
            }

            try {
                val db = AppDatabase.getInstance(context)
                val protectedPaths = HashSet<String>()

                // 1. Protege todas as ordens locais ainda não sincronizadas com o servidor
                val allOrders = db.serviceOrderDao().getAllOrders()
                val unsyncedOrderIds = HashSet<String>()
                for (o in allOrders) {
                    if (!o.isSyncedWithServer) {
                        unsyncedOrderIds.add(o.id)
                        o.clientSignaturePath?.takeIf { it.isNotBlank() }?.let { protectedPaths.add(it) }
                    }
                }

                // 2. Protege fotos de checklists ainda não sincronizados ou vinculados a ordens não sincronizadas
                val allChecklists = db.equipmentChecklistDao().getAllChecklists()
                for (c in allChecklists) {
                    if (!c.isSynced || c.orderId in unsyncedOrderIds) {
                        try {
                            val arr = JSONArray(c.localPhotoPathsJson)
                            for (i in 0 until arr.length()) {
                                val p = arr.optString(i, "")
                                if (p.isNotBlank()) protectedPaths.add(p)
                            }
                        } catch (_: Exception) {}
                    }
                }

                // 3. Protege fotos "Outros" de ordens ainda não sincronizadas
                val extrasPrefs = context.getSharedPreferences("lefrio_order_extras_prefs", Context.MODE_PRIVATE)
                for (oid in unsyncedOrderIds) {
                    val raw = extrasPrefs.getString("other_photos_$oid", null) ?: continue
                    try {
                        val arr = JSONArray(raw)
                        for (i in 0 until arr.length()) {
                            val p = arr.optString(i, "")
                            if (p.isNotBlank()) protectedPaths.add(p)
                        }
                    } catch (_: Exception) {}
                }

                // 4. Protege absolutamente qualquer caminho referenciado na fila de sincronização (inclusive QUARANTINED)
                val unfinishedTasks = db.syncQueueDao().getAllUnfinishedTasks()
                for (task in unfinishedTasks) {
                    try {
                        val p = JSONObject(task.payloadJson)
                        p.optString("signatureFilePath", "").takeIf { it.isNotBlank() }?.let { protectedPaths.add(it) }
                        p.optString("clientSignaturePath", "").takeIf { it.isNotBlank() }?.let { protectedPaths.add(it) }
                        p.optJSONArray("otherPhotoPaths")?.let { arr ->
                            for (i in 0 until arr.length()) {
                                arr.optString(i, "").takeIf { it.isNotBlank() }?.let { protectedPaths.add(it) }
                            }
                        }
                        p.optJSONArray("localPhotoPaths")?.let { arr ->
                            for (i in 0 until arr.length()) {
                                arr.optString(i, "").takeIf { it.isNotBlank() }?.let { protectedPaths.add(it) }
                            }
                        }
                        p.optJSONArray("checklist")?.let { clArr ->
                            for (i in 0 until clArr.length()) {
                                val itemObj = clArr.optJSONObject(i) ?: continue
                                itemObj.optJSONArray("localPhotoPaths")?.let { arr ->
                                    for (j in 0 until arr.length()) {
                                        arr.optString(j, "").takeIf { it.isNotBlank() }?.let { protectedPaths.add(it) }
                                    }
                                }
                            }
                        }
                    } catch (_: Exception) {}
                }

                val cutoffTime = now - RETENTION_MS
                val baseDir = context.getExternalFilesDir(Environment.DIRECTORY_PICTURES)
                val targetDirs = listOfNotNull(
                    baseDir?.let { File(it, "ServicePhotos") },
                    baseDir?.let { File(it, "Signatures") }
                )

                var deletedCount = 0
                for (dir in targetDirs) {
                    if (!dir.exists() || !dir.isDirectory) continue
                    val files = dir.listFiles() ?: continue
                    for (file in files) {
                        if (!file.isFile) continue
                        val absPath = file.absolutePath
                        if (absPath in protectedPaths) continue
                        if (file.lastModified() in 1L until cutoffTime) {
                            if (file.delete()) {
                                deletedCount++
                            }
                        }
                    }
                }

                prefs.edit().putLong(KEY_LAST_CLEANUP_AT, now).apply()
                if (deletedCount > 0) {
                    Log.d(TAG, "Limpeza automática concluída: $deletedCount arquivo(s) sincronizado(s) com mais de 7 dias removido(s).")
                }
                deletedCount
            } catch (e: Exception) {
                Log.w(TAG, "Aviso na limpeza automática de mídia antiga: ${e.message}")
                0
            }
        }
    }

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
     * Pré-compressão única no momento da captura (720px, JPEG 60%):
     * Reduz uso de disco, economiza 4G e elimina pico de CPU/RAM na reconexão pós-offline.
     */
    fun compressPhoto(photoFile: File): File {
        return try {
            if (!photoFile.exists()) return photoFile

            val options = BitmapFactory.Options().apply {
                inJustDecodeBounds = true
            }
            BitmapFactory.decodeFile(photoFile.absolutePath, options)

            val width = options.outWidth
            val height = options.outHeight
            if (width <= 0 || height <= 0) return photoFile

            var inSampleSize = 1
            while ((width / inSampleSize) > CAPTURE_MAX_DIMENSION * 2 || (height / inSampleSize) > CAPTURE_MAX_DIMENSION * 2) {
                inSampleSize *= 2
            }

            val decodeOptions = BitmapFactory.Options().apply {
                this.inSampleSize = inSampleSize
            }
            val decoded = BitmapFactory.decodeFile(photoFile.absolutePath, decodeOptions) ?: return photoFile

            val scale = minOf(
                1f,
                CAPTURE_MAX_DIMENSION.toFloat() / decoded.width.toFloat(),
                CAPTURE_MAX_DIMENSION.toFloat() / decoded.height.toFloat()
            )
            val finalBitmap = if (scale < 1f) {
                val targetW = (decoded.width * scale).toInt().coerceAtLeast(1)
                val targetH = (decoded.height * scale).toInt().coerceAtLeast(1)
                Bitmap.createScaledBitmap(decoded, targetW, targetH, true).also {
                    if (it !== decoded) decoded.recycle()
                }
            } else {
                decoded
            }

            FileOutputStream(photoFile).use { outputStream ->
                finalBitmap.compress(Bitmap.CompressFormat.JPEG, CAPTURE_JPEG_QUALITY, outputStream)
                outputStream.flush()
            }
            finalBitmap.recycle()

            photoFile
        } catch (t: Throwable) {
            photoFile
        }
    }

    /**
     * Copia e pré-comprime uma foto selecionada da Galeria para o armazenamento local do app.
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

    /**
     * Converte uma foto local para Data URL JPEG compacta (compatível com PWA e abaixo do limite de 1MB do Firestore).
     * Usa caminho rápido sem decodificar Bitmap quando o arquivo já foi pré-comprimido dentro dos limites solicitados.
     */
    fun encodeFileToDataUrl(
        photoFile: File,
        maxDimension: Int = CAPTURE_MAX_DIMENSION,
        quality: Int = 55
    ): String? {
        return try {
            if (!photoFile.exists() || photoFile.length() <= 0L) return null

            val boundsOptions = BitmapFactory.Options().apply {
                inJustDecodeBounds = true
            }
            BitmapFactory.decodeFile(photoFile.absolutePath, boundsOptions)

            val origW = boundsOptions.outWidth
            val origH = boundsOptions.outHeight
            if (origW <= 0 || origH <= 0) return null

            // Fast-path: se já está pré-comprimida no tamanho alvo e leve em disco, evita decodificar Bitmap em RAM
            if (origW <= maxDimension && origH <= maxDimension && photoFile.length() <= FAST_PATH_MAX_FILE_BYTES && quality >= 55) {
                val rawBytes = photoFile.readBytes()
                val base64 = android.util.Base64.encodeToString(rawBytes, android.util.Base64.NO_WRAP)
                return "data:image/jpeg;base64,$base64"
            }

            var inSampleSize = 1
            while ((origW / inSampleSize) > maxDimension * 2 || (origH / inSampleSize) > maxDimension * 2) {
                inSampleSize *= 2
            }

            val decodeOptions = BitmapFactory.Options().apply {
                this.inSampleSize = inSampleSize
            }
            val decoded = BitmapFactory.decodeFile(photoFile.absolutePath, decodeOptions) ?: return null

            val scale = minOf(
                1f,
                maxDimension.toFloat() / decoded.width.toFloat(),
                maxDimension.toFloat() / decoded.height.toFloat()
            )
            val scaledBitmap = if (scale < 1f) {
                val targetW = (decoded.width * scale).toInt().coerceAtLeast(1)
                val targetH = (decoded.height * scale).toInt().coerceAtLeast(1)
                Bitmap.createScaledBitmap(decoded, targetW, targetH, true).also {
                    if (it !== decoded) decoded.recycle()
                }
            } else {
                decoded
            }

            val baos = java.io.ByteArrayOutputStream()
            scaledBitmap.compress(Bitmap.CompressFormat.JPEG, quality, baos)
            scaledBitmap.recycle()

            val bytes = baos.toByteArray()
            val base64 = android.util.Base64.encodeToString(bytes, android.util.Base64.NO_WRAP)
            "data:image/jpeg;base64,$base64"
        } catch (t: Throwable) {
            null
        }
    }
}
