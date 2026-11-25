package com.lefrio.atendimento.util

import android.content.Context
import android.content.Intent
import android.content.SharedPreferences
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.provider.Settings
import android.util.Log
import android.widget.Toast
import androidx.core.content.FileProvider
import com.lefrio.atendimento.data.FirebaseConfig
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.currentCoroutineContext
import kotlinx.coroutines.delay
import kotlinx.coroutines.ensureActive
import kotlinx.coroutines.tasks.await
import kotlinx.coroutines.withContext
import org.json.JSONObject
import java.io.BufferedReader
import java.io.File
import java.io.FileOutputStream
import java.io.InputStreamReader
import java.net.HttpURLConnection
import java.net.URL

data class AppUpdateInfo(
    val isAvailable: Boolean = false,
    val latestVersionCode: Long = 1,
    val latestVersionName: String = "1.0.0",
    val downloadUrl: String = "",
    val releaseNotes: String = "",
    val isMandatory: Boolean = false,
    val isAlreadyDownloaded: Boolean = false
)

sealed class ApkValidationResult {
    data class Valid(val versionCode: Long, val versionName: String) : ApkValidationResult()
    data class Invalid(val reason: String) : ApkValidationResult()
}

class AppUpdateManager(private val context: Context) {

    private val TAG = "AppUpdateManager"
    private val firestore = FirebaseConfig.getFirestore()
    private val API_VERSION_URL = "${FirebaseConfig.SHARED_API_BASE}/api/android-version"
    private val PREFS_NAME = "lefrio_app_update_prefs"
    private val KEY_DISMISSED_VERSION = "dismissed_version_code"
    private val KEY_DISMISSED_TIMESTAMP = "dismissed_timestamp"
    private val KEY_LAST_AUTO_CHECK_AT = "last_auto_check_at_ms"

    companion object {
        private const val AUTO_CHECK_INTERVAL_MS = 30L * 60L * 1000L // 30 minutos
        private const val DISMISS_COOLDOWN_MS = 24L * 60L * 60L * 1000L // 24 horas
        private const val PROGRESS_EMIT_INTERVAL_MS = 150L
        private const val DOWNLOAD_BUFFER_SIZE = 65_536 // 64 KB
        private const val MIN_VALID_APK_BYTES = 500_000L
        private const val MAX_DOWNLOAD_ATTEMPTS = 2
    }

    private val prefs: SharedPreferences =
        context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)

    fun getCurrentVersionCode(): Long {
        return try {
            val pInfo = context.packageManager.getPackageInfo(context.packageName, 0)
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
                pInfo.longVersionCode
            } else {
                @Suppress("DEPRECATION")
                pInfo.versionCode.toLong()
            }
        } catch (e: Exception) {
            1L
        }
    }

    fun getCurrentVersionName(): String {
        return try {
            val pInfo = context.packageManager.getPackageInfo(context.packageName, 0)
            pInfo.versionName ?: "1.0.0"
        } catch (e: Exception) {
            "1.0.0"
        }
    }

    fun canInstallPackages(): Boolean {
        return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            try {
                context.packageManager.canRequestPackageInstalls()
            } catch (_: Exception) {
                false
            }
        } else {
            true
        }
    }

    fun shouldAutoCheckNow(): Boolean {
        val lastCheck = prefs.getLong(KEY_LAST_AUTO_CHECK_AT, 0L)
        return (System.currentTimeMillis() - lastCheck) >= AUTO_CHECK_INTERVAL_MS
    }

    fun markAutoCheckNow() {
        prefs.edit().putLong(KEY_LAST_AUTO_CHECK_AT, System.currentTimeMillis()).apply()
    }

    fun markUpdateDismissed(versionCode: Long) {
        prefs.edit()
            .putLong(KEY_DISMISSED_VERSION, versionCode)
            .putLong(KEY_DISMISSED_TIMESTAMP, System.currentTimeMillis())
            .apply()
    }

    fun isUpdateDismissed(versionCode: Long): Boolean {
        val dismissedVersion = prefs.getLong(KEY_DISMISSED_VERSION, -1L)
        if (dismissedVersion != versionCode) return false

        val dismissedTime = prefs.getLong(KEY_DISMISSED_TIMESTAMP, 0L)
        val now = System.currentTimeMillis()
        return (now - dismissedTime) < DISMISS_COOLDOWN_MS
    }

    fun clearDismissedUpdate() {
        prefs.edit().remove(KEY_DISMISSED_VERSION).remove(KEY_DISMISSED_TIMESTAMP).apply()
    }

    fun getDownloadedApkFile(): File {
        // Usa preferencialmente getExternalFilesDir para que instaladores de fabricantes (Xiaomi, Samsung, Motorola)
        // tenham acesso de leitura garantido pelo FileProvider e pelo kernel
        val baseDir = context.getExternalFilesDir(android.os.Environment.DIRECTORY_DOWNLOADS)
            ?: context.cacheDir
        val dir = File(baseDir, "updates")
        if (!dir.exists()) {
            dir.mkdirs()
        }
        return File(dir, "lefrio-update.apk")
    }

    /**
     * Remove automaticamente arquivos de APK já instalados (ou corrompidos/temporários)
     * para liberar espaço e evitar reutilização de builds antigos.
     */
    fun cleanupObsoleteDownloadedApk() {
        try {
            val apkFile = getDownloadedApkFile()
            val tempFile = File(apkFile.parentFile ?: context.cacheDir, "lefrio-update.apk.tmp")
            if (tempFile.exists()) {
                tempFile.delete()
            }
            if (!apkFile.exists()) return

            val currentCode = getCurrentVersionCode()
            when (val validation = verifyDownloadedApk(apkFile)) {
                is ApkValidationResult.Valid -> {
                    if (validation.versionCode <= currentCode) {
                        apkFile.delete()
                        Log.d(TAG, "APK obsoleto v${validation.versionName} (${validation.versionCode}) removido após atualização.")
                    }
                }
                is ApkValidationResult.Invalid -> {
                    apkFile.delete()
                }
            }
        } catch (_: Exception) {}
    }

    /**
     * Valida se o arquivo baixado é de fato um APK Android válido, não corrompido,
     * e correspondente ao mesmo applicationId/packageName do app.
     */
    fun verifyDownloadedApk(apkFile: File = getDownloadedApkFile()): ApkValidationResult {
        if (!apkFile.exists() || apkFile.length() < MIN_VALID_APK_BYTES) {
            return ApkValidationResult.Invalid("Arquivo de atualização não encontrado ou incompleto.")
        }

        return try {
            val packageInfo = context.packageManager.getPackageArchiveInfo(
                apkFile.absolutePath,
                0
            ) ?: return ApkValidationResult.Invalid("O arquivo baixado não é um pacote APK Android válido.")

            val apkPackage = packageInfo.packageName ?: ""
            val expectedPackage = context.packageName

            // Valida se o pacote do APK bate com o pacote do aplicativo instalado (ou variante debug)
            val isPackageMatch = apkPackage.equals(expectedPackage, ignoreCase = true) ||
                    apkPackage.equals("${expectedPackage}.debug", ignoreCase = true) ||
                    expectedPackage.equals("${apkPackage}.debug", ignoreCase = true) ||
                    apkPackage.startsWith("com.lefrio.atendimento")

            if (!isPackageMatch) {
                return ApkValidationResult.Invalid(
                    "Conflito de pacote: O APK baixado é de '$apkPackage', mas o app instalado é '$expectedPackage'."
                )
            }

            val apkVersionCode = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
                packageInfo.longVersionCode
            } else {
                @Suppress("DEPRECATION")
                packageInfo.versionCode.toLong()
            }

            ApkValidationResult.Valid(
                versionCode = apkVersionCode,
                versionName = packageInfo.versionName ?: "1.0.0"
            )
        } catch (e: Exception) {
            Log.e(TAG, "Falha ao verificar integridade do APK: ${e.message}", e)
            ApkValidationResult.Invalid("Falha ao analisar o arquivo APK: ${e.message}")
        }
    }

    suspend fun checkForUpdates(isManualCheck: Boolean = false): AppUpdateInfo = withContext(Dispatchers.IO) {
        cleanupObsoleteDownloadedApk()
        markAutoCheckNow()

        if (!NetworkMonitor.hasValidatedInternet(context)) {
            return@withContext AppUpdateInfo(isAvailable = false)
        }

        val currentCode = getCurrentVersionCode()

        var remoteVersionCode = 1L
        var remoteVersionName = "1.0.0"
        var downloadUrl = ""
        var releaseNotes = "Melhorias de desempenho e estabilidade."
        var isMandatory = false

        // 1. Tenta buscar informações no Firestore com timeout seguro
        var infoFound = false
        try {
            val doc = kotlinx.coroutines.withTimeoutOrNull(6_000L) {
                firestore.collection("app_config")
                    .document("android_version")
                    .get(com.google.firebase.firestore.Source.SERVER)
                    .await()
            }

            if (doc != null && doc.exists()) {
                remoteVersionCode = doc.getLong("versionCode") ?: 1L
                remoteVersionName = doc.getString("versionName") ?: "1.0.0"
                downloadUrl = doc.getString("downloadUrl") ?: ""
                releaseNotes = doc.getString("releaseNotes") ?: "Melhorias de desempenho e estabilidade."
                isMandatory = doc.getBoolean("isMandatory") ?: false
                infoFound = downloadUrl.isNotBlank()
            }
        } catch (e: Exception) {
            Log.e(TAG, "Tentativa Firestore falhou: ${e.message}")
        }

        // 2. Fallback via API REST do sistema caso Firestore falhe
        if (!infoFound) {
            try {
                val url = URL(API_VERSION_URL)
                val connection = (url.openConnection() as HttpURLConnection).apply {
                    connectTimeout = 5000
                    readTimeout = 5000
                    useCaches = false
                    requestMethod = "GET"
                    setRequestProperty("Cache-Control", "no-cache")
                }

                try {
                    if (connection.responseCode == 200) {
                        val response = BufferedReader(InputStreamReader(connection.inputStream)).use { it.readText() }
                        val json = JSONObject(response)
                        remoteVersionCode = json.optLong("versionCode", 1L)
                        remoteVersionName = json.optString("versionName", "1.0.0")
                        downloadUrl = json.optString("downloadUrl", "")
                        releaseNotes = json.optString("releaseNotes", "Melhorias de desempenho e estabilidade.")
                        isMandatory = json.optBoolean("isMandatory", false)
                        infoFound = downloadUrl.isNotBlank()
                    }
                } finally {
                    connection.disconnect()
                }
            } catch (e: Exception) {
                Log.e(TAG, "Tentativa REST falhou: ${e.message}")
            }
        }

        if (!infoFound) {
            return@withContext AppUpdateInfo(isAvailable = false)
        }

        val isNewer = remoteVersionCode > currentCode && downloadUrl.isNotBlank()
        if (!isNewer) {
            return@withContext AppUpdateInfo(
                isAvailable = false,
                latestVersionCode = remoteVersionCode,
                latestVersionName = remoteVersionName
            )
        }

        // Verifica se o APK correspondente (na mesma build ou mais nova) já foi baixado e está íntegro
        val apkFile = getDownloadedApkFile()
        val isAlreadyDownloaded = when (val valid = verifyDownloadedApk(apkFile)) {
            is ApkValidationResult.Valid -> valid.versionCode >= remoteVersionCode && valid.versionCode > currentCode
            is ApkValidationResult.Invalid -> false
        }

        AppUpdateInfo(
            isAvailable = true,
            latestVersionCode = remoteVersionCode,
            latestVersionName = remoteVersionName,
            downloadUrl = downloadUrl.trim(),
            releaseNotes = releaseNotes,
            isMandatory = isMandatory,
            isAlreadyDownloaded = isAlreadyDownloaded
        )
    }

    private fun normalizeDownloadUrl(url: String): String {
        val trimmed = url.trim()
        if (trimmed.contains("drive.google.com/file/d/")) {
            val fileId = trimmed.substringAfter("drive.google.com/file/d/").substringBefore("/")
            return "https://drive.google.com/uc?export=download&confirm=t&id=$fileId"
        }
        return trimmed
    }

    /**
     * Download direto em background usando Coroutines com:
     * - Validação real da versão em cache (nunca reaproveita APK antigo)
     * - Retentativa automática em rede 4G instável
     * - Detecção de resposta HTML inválida
     * - Buffer de 64 KB com atualização de progresso controlada (sem engasgos na UI)
     * - Cancelamento seguro pela coroutine
     */
    suspend fun downloadApkDirectly(
        downloadUrl: String,
        expectedVersionCode: Long = 0L,
        forceRedownload: Boolean = false,
        onProgress: (progress: Float, downloadedBytes: Long, totalBytes: Long) -> Unit
    ): Result<File> = withContext(Dispatchers.IO) {
        val finalApkFile = getDownloadedApkFile()
        val tempApkFile = File(finalApkFile.parentFile ?: context.cacheDir, "lefrio-update.apk.tmp")
        val currentCode = getCurrentVersionCode()

        // 1. OTIMIZAÇÃO SEGURA: Só reutiliza APK local se ele corresponder à build esperada (e for mais novo que o instalado)
        if (!forceRedownload) {
            val existingValidation = verifyDownloadedApk(finalApkFile)
            if (existingValidation is ApkValidationResult.Valid &&
                existingValidation.versionCode > currentCode &&
                (expectedVersionCode <= 0L || existingValidation.versionCode >= expectedVersionCode)
            ) {
                Log.i(TAG, "APK v${existingValidation.versionName} (${existingValidation.versionCode}) já baixado e íntegro.")
                withContext(Dispatchers.Main) {
                    onProgress(1f, finalApkFile.length(), finalApkFile.length())
                }
                return@withContext Result.success(finalApkFile)
            } else if (finalApkFile.exists()) {
                // Remove APK de versão anterior para garantir download limpo da nova versão
                finalApkFile.delete()
            }
        } else if (finalApkFile.exists()) {
            finalApkFile.delete()
        }

        var lastError: Exception? = null

        for (attempt in 1..MAX_DOWNLOAD_ATTEMPTS) {
            currentCoroutineContext().ensureActive()
            var connection: HttpURLConnection? = null
            try {
                var currentUrl = normalizeDownloadUrl(downloadUrl)
                var redirects = 0
                val maxRedirects = 8

                while (redirects < maxRedirects) {
                    currentCoroutineContext().ensureActive()
                    val urlObj = URL(currentUrl)
                    connection = (urlObj.openConnection() as HttpURLConnection).apply {
                        connectTimeout = 15_000
                        readTimeout = 30_000
                        useCaches = false
                        instanceFollowRedirects = false
                        setRequestProperty("User-Agent", "LeFrio-Android-Updater/2.0")
                        setRequestProperty("Accept", "application/vnd.android.package-archive,application/octet-stream,*/*")
                        setRequestProperty("Cache-Control", "no-cache")
                        setRequestProperty("Pragma", "no-cache")
                    }

                    val status = connection.responseCode
                    if (status == HttpURLConnection.HTTP_MOVED_TEMP ||
                        status == HttpURLConnection.HTTP_MOVED_PERM ||
                        status == HttpURLConnection.HTTP_SEE_OTHER ||
                        status == 307 || status == 308
                    ) {
                        val newLocation = connection.getHeaderField("Location")
                        if (!newLocation.isNullOrBlank()) {
                            currentUrl = if (newLocation.startsWith("http://") || newLocation.startsWith("https://")) {
                                newLocation
                            } else {
                                URL(urlObj, newLocation).toString()
                            }
                            connection.disconnect()
                            redirects++
                            continue
                        }
                    }
                    break
                }

                if (connection == null || connection.responseCode !in 200..299) {
                    val code = connection?.responseCode ?: -1
                    val msg = connection?.responseMessage ?: "Erro de conexão"
                    throw Exception("Falha no servidor de download (HTTP $code: $msg).")
                }

                val contentType = (connection.contentType ?: "").lowercase()
                if (contentType.contains("text/html") || contentType.contains("application/json")) {
                    throw Exception("O link configurado não retornou um arquivo APK válido (verifique o link da Release no painel administrativo).")
                }

                val totalBytes = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
                    connection.contentLengthLong
                } else {
                    connection.contentLength.toLong()
                }
                var downloadedBytes = 0L

                if (tempApkFile.exists()) {
                    tempApkFile.delete()
                }

                var lastEmitAt = 0L
                var headerChecked = false

                connection.inputStream.use { input ->
                    FileOutputStream(tempApkFile).use { output ->
                        val buffer = ByteArray(DOWNLOAD_BUFFER_SIZE)
                        var bytesRead: Int

                        while (input.read(buffer).also { bytesRead = it } != -1) {
                            currentCoroutineContext().ensureActive()

                            // Verifica cabeçalho mágico PK (ZIP/APK) nos primeiros bytes para detectar páginas de erro HTML
                            if (!headerChecked && bytesRead >= 2) {
                                headerChecked = true
                                val isZipHeader = (buffer[0] == 0x50.toByte() && buffer[1] == 0x4B.toByte())
                                if (!isZipHeader) {
                                    throw Exception("O link não aponta para um arquivo APK válido. Verifique o link de download no administrativo.")
                                }
                            }

                            output.write(buffer, 0, bytesRead)
                            downloadedBytes += bytesRead

                            val now = System.currentTimeMillis()
                            if (now - lastEmitAt >= PROGRESS_EMIT_INTERVAL_MS || (totalBytes > 0 && downloadedBytes >= totalBytes)) {
                                lastEmitAt = now
                                val progress = if (totalBytes > 0) {
                                    (downloadedBytes.toFloat() / totalBytes.toFloat()).coerceIn(0f, 1f)
                                } else {
                                    -1f // Progresso indeterminado quando o servidor não informa Content-Length
                                }
                                withContext(Dispatchers.Main) {
                                    onProgress(progress, downloadedBytes, totalBytes)
                                }
                            }
                        }
                        output.flush()
                    }
                }

                if (tempApkFile.length() < MIN_VALID_APK_BYTES) {
                    tempApkFile.delete()
                    throw Exception("O arquivo baixado ficou incompleto (${tempApkFile.length() / 1024} KB). Verifique sua conexão.")
                }

                // Substitui atomicamente o arquivo final
                if (finalApkFile.exists()) {
                    finalApkFile.delete()
                }
                if (!tempApkFile.renameTo(finalApkFile)) {
                    tempApkFile.copyTo(finalApkFile, overwrite = true)
                    tempApkFile.delete()
                }

                // Validação final de integridade e versão do APK baixado
                return@withContext when (val result = verifyDownloadedApk(finalApkFile)) {
                    is ApkValidationResult.Valid -> {
                        if (result.versionCode <= currentCode) {
                            finalApkFile.delete()
                            Result.failure(
                                Exception(
                                    "O APK disponível no servidor ainda está na versão v${result.versionName} (Build ${result.versionCode}). Aguarde a publicação do novo APK."
                                )
                            )
                        } else {
                            withContext(Dispatchers.Main) {
                                onProgress(1f, finalApkFile.length(), finalApkFile.length())
                            }
                            Log.i(TAG, "APK baixado e validado com sucesso: v${result.versionName} (${result.versionCode})")
                            Result.success(finalApkFile)
                        }
                    }
                    is ApkValidationResult.Invalid -> {
                        finalApkFile.delete()
                        Result.failure(Exception("APK corrompido ou incompatível: ${result.reason}"))
                    }
                }
            } catch (ce: CancellationException) {
                if (tempApkFile.exists()) tempApkFile.delete()
                throw ce
            } catch (e: Exception) {
                Log.w(TAG, "Tentativa $attempt/$MAX_DOWNLOAD_ATTEMPTS falhou: ${e.message}")
                if (tempApkFile.exists()) tempApkFile.delete()
                lastError = e
                // Não tenta novamente em erros definitivos de link inválido / HTTP 404
                val msgLower = (e.message ?: "").lowercase()
                val isPermanentError = msgLower.contains("http 404") ||
                    msgLower.contains("http 403") ||
                    msgLower.contains("não retornou um arquivo apk") ||
                    msgLower.contains("não aponta para um arquivo apk")
                if (isPermanentError || attempt >= MAX_DOWNLOAD_ATTEMPTS) {
                    break
                }
                delay(1500L)
            } finally {
                try {
                    connection?.disconnect()
                } catch (_: Exception) {}
            }
        }

        Result.failure(lastError ?: Exception("Não foi possível baixar a atualização. Verifique sua internet e tente novamente."))
    }

    /**
     * Dispara o instalador oficial do Android para o APK baixado, tratando permissão de fontes
     * desconhecidas (Android 8+) e permissões FileProvider em todos os fabricantes (Samsung, Xiaomi, Motorola, AOSP).
     */
    fun installDownloadedApk(onNeedPermission: (() -> Unit)? = null): Boolean {
        try {
            val apkFile = getDownloadedApkFile()
            if (!apkFile.exists() || apkFile.length() == 0L) {
                Toast.makeText(context, "Arquivo de atualização não encontrado.", Toast.LENGTH_LONG).show()
                return false
            }

            when (val validation = verifyDownloadedApk(apkFile)) {
                is ApkValidationResult.Invalid -> {
                    Toast.makeText(context, "Erro na atualização: ${validation.reason}", Toast.LENGTH_LONG).show()
                    apkFile.delete()
                    return false
                }
                is ApkValidationResult.Valid -> {
                    Log.d(TAG, "APK validado para instalação: v${validation.versionName} (${validation.versionCode})")
                }
            }

            // No Android 8.0+ (Oreo), solicita permissão para instalar atualizações do próprio app
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && !canInstallPackages()) {
                onNeedPermission?.invoke()
                Toast.makeText(
                    context,
                    "Ative 'Permitir desta fonte' e volte — a instalação abrirá automaticamente.",
                    Toast.LENGTH_LONG
                ).show()

                val permissionIntent = Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES).apply {
                    data = Uri.parse("package:${context.packageName}")
                    flags = Intent.FLAG_ACTIVITY_NEW_TASK
                }
                context.startActivity(permissionIntent)
                return false
            }

            apkFile.setReadable(true, false)

            val apkUri = FileProvider.getUriForFile(
                context,
                "${context.packageName}.fileprovider",
                apkFile
            )

            val installIntent = Intent(Intent.ACTION_VIEW).apply {
                setDataAndType(apkUri, "application/vnd.android.package-archive")
                addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP)
                addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
                putExtra(Intent.EXTRA_NOT_UNKNOWN_SOURCE, true)
                putExtra(Intent.EXTRA_RETURN_RESULT, false)
            }

            // Concede permissões explícitas aos instaladores de fabricantes e aos resolvidos pelo sistema
            val knownInstallers = listOf(
                "com.google.android.packageinstaller",
                "com.android.packageinstaller",
                "com.miui.packageinstaller",
                "com.samsung.android.packageinstaller",
                "com.oplus.appdetail"
            )
            for (pkg in knownInstallers) {
                try {
                    context.grantUriPermission(pkg, apkUri, Intent.FLAG_GRANT_READ_URI_PERMISSION)
                } catch (_: Exception) {}
            }

            val resolvedActivities = context.packageManager.queryIntentActivities(
                installIntent,
                PackageManager.MATCH_DEFAULT_ONLY
            )
            for (resolveInfo in resolvedActivities) {
                val targetPackage = resolveInfo.activityInfo.packageName
                try {
                    context.grantUriPermission(
                        targetPackage,
                        apkUri,
                        Intent.FLAG_GRANT_READ_URI_PERMISSION
                    )
                } catch (_: Exception) {}
            }

            context.startActivity(installIntent)
            Log.i(TAG, "Instalador de pacotes do Android aberto com sucesso!")
            return true
        } catch (e: Exception) {
            Log.e(TAG, "Falha ao abrir instalador do APK: ${e.message}", e)
            Toast.makeText(context, "Falha ao abrir instalador: ${e.message}", Toast.LENGTH_LONG).show()
            return false
        }
    }
}
