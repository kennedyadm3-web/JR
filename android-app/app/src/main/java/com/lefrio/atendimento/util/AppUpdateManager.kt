package com.lefrio.atendimento.util

import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.content.SharedPreferences
import android.content.pm.PackageInstaller
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.provider.Settings
import android.util.Log
import android.widget.Toast
import androidx.core.content.FileProvider
import com.lefrio.atendimento.data.FirebaseConfig
import kotlinx.coroutines.Dispatchers
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
        // Silencia por 24 horas caso o usuário tenha dispensado
        return (now - dismissedTime) < 24 * 60 * 60 * 1000
    }

    fun clearDismissedUpdate() {
        prefs.edit().remove(KEY_DISMISSED_VERSION).remove(KEY_DISMISSED_TIMESTAMP).apply()
    }

    fun getDownloadedApkFile(): File {
        // Usa o diretório de cache interno com subpasta dedicada a updates (acesso 100% garantido pelo FileProvider e PackageInstaller)
        val dir = File(context.cacheDir, "updates")
        if (!dir.exists()) {
            dir.mkdirs()
        }
        return File(dir, "lefrio-update.apk")
    }

    /**
     * Valida se o arquivo baixado é de fato um APK Android válido, não corrompido,
     * e correspondente ao mesmo applicationId/packageName do app.
     */
    fun verifyDownloadedApk(apkFile: File = getDownloadedApkFile()): ApkValidationResult {
        if (!apkFile.exists() || apkFile.length() < 500_000L) {
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
        val currentCode = getCurrentVersionCode()

        var remoteVersionCode = 1L
        var remoteVersionName = "1.0.0"
        var downloadUrl = ""
        var releaseNotes = "Melhorias de desempenho e estabilidade."
        var isMandatory = false

        // 1. Tenta buscar informações no Firestore
        var infoFound = false
        try {
            val doc = firestore.collection("app_config")
                .document("android_version")
                .get()
                .await()

            if (doc.exists()) {
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
                    connectTimeout = 4000
                    readTimeout = 4000
                    requestMethod = "GET"
                }

                if (connection.responseCode == 200) {
                    val reader = BufferedReader(InputStreamReader(connection.inputStream))
                    val response = reader.readText()
                    reader.close()

                    val json = JSONObject(response)
                    remoteVersionCode = json.optLong("versionCode", 1L)
                    remoteVersionName = json.optString("versionName", "1.0.0")
                    downloadUrl = json.optString("downloadUrl", "")
                    releaseNotes = json.optString("releaseNotes", "Melhorias de desempenho e estabilidade.")
                    isMandatory = json.optBoolean("isMandatory", false)
                    infoFound = downloadUrl.isNotBlank()
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

        // Se não for checagem manual e o usuário dispensou essa versão recentemente, não incomoda
        if (!isManualCheck && !isMandatory && isUpdateDismissed(remoteVersionCode)) {
            Log.d(TAG, "Atualização v$remoteVersionName dispensada recentemente pelo usuário.")
            return@withContext AppUpdateInfo(isAvailable = false)
        }

        // Verifica se o APK correspondente já foi baixado previamente e está íntegro no aparelho
        val apkFile = getDownloadedApkFile()
        val isAlreadyDownloaded = when (val valid = verifyDownloadedApk(apkFile)) {
            is ApkValidationResult.Valid -> valid.versionCode >= remoteVersionCode
            is ApkValidationResult.Invalid -> false
        }

        AppUpdateInfo(
            isAvailable = true,
            latestVersionCode = remoteVersionCode,
            latestVersionName = remoteVersionName,
            downloadUrl = downloadUrl,
            releaseNotes = releaseNotes,
            isMandatory = isMandatory,
            isAlreadyDownloaded = isAlreadyDownloaded
        )
    }

    private fun normalizeDownloadUrl(url: String): String {
        val trimmed = url.trim()
        if (trimmed.contains("drive.google.com/file/d/")) {
            val fileId = trimmed.substringAfter("drive.google.com/file/d/").substringBefore("/")
            return "https://drive.google.com/uc?export=download&id=$fileId"
        }
        return trimmed
    }

    /**
     * Download direto em background usando Coroutines com suporte resiliente a
     * múltiplos redirecionamentos HTTP e validação de arquivo existente.
     */
    suspend fun downloadApkDirectly(
        downloadUrl: String,
        onProgress: (progress: Float, downloadedBytes: Long, totalBytes: Long) -> Unit
    ): Result<File> = withContext(Dispatchers.IO) {
        val finalApkFile = getDownloadedApkFile()
        val tempApkFile = File(finalApkFile.parentFile ?: context.cacheDir, "lefrio-update.apk.tmp")

        // 1. OTIMIZAÇÃO: Se o arquivo já foi baixado previamente e é válido, não baixa de novo!
        val existingValidation = verifyDownloadedApk(finalApkFile)
        if (existingValidation is ApkValidationResult.Valid) {
            Log.i(TAG, "APK válido já presente localmente (v${existingValidation.versionName}). Pulando download.")
            withContext(Dispatchers.Main) {
                onProgress(1f, finalApkFile.length(), finalApkFile.length())
            }
            return@withContext Result.success(finalApkFile)
        }

        try {
            var currentUrl = normalizeDownloadUrl(downloadUrl)
            var connection: HttpURLConnection? = null
            var redirects = 0
            val maxRedirects = 8

            // Trata múltiplos saltos de redirecionamento HTTP (301, 302, 303, 307, 308)
            while (redirects < maxRedirects) {
                val urlObj = URL(currentUrl)
                connection = (urlObj.openConnection() as HttpURLConnection).apply {
                    connectTimeout = 15000
                    readTimeout = 30000
                    instanceFollowRedirects = true
                    setRequestProperty("User-Agent", "LeFrio-Android-Updater/1.0")
                    setRequestProperty("Accept", "application/vnd.android.package-archive,application/octet-stream,*/*")
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
                return@withContext Result.failure(Exception("Falha ao conectar no servidor de download (HTTP $code: $msg)"))
            }

            val totalBytes = connection.contentLength.toLong()
            var downloadedBytes = 0L

            if (tempApkFile.exists()) {
                tempApkFile.delete()
            }

            connection.inputStream.use { input ->
                FileOutputStream(tempApkFile).use { output ->
                    val buffer = ByteArray(16384)
                    var bytesRead: Int

                    while (input.read(buffer).also { bytesRead = it } != -1) {
                        output.write(buffer, 0, bytesRead)
                        downloadedBytes += bytesRead

                        val progress = if (totalBytes > 0) {
                            (downloadedBytes.toFloat() / totalBytes.toFloat()).coerceIn(0f, 1f)
                        } else {
                            0f
                        }

                        withContext(Dispatchers.Main) {
                            onProgress(progress, downloadedBytes, totalBytes)
                        }
                    }
                    output.flush()
                }
            }

            connection.disconnect()

            // Validação de tamanho mínimo
            if (tempApkFile.length() < 500_000L) {
                tempApkFile.delete()
                return@withContext Result.failure(Exception("Arquivo baixado está incompleto."))
            }

            // Substitui atomicamente o arquivo final
            if (finalApkFile.exists()) {
                finalApkFile.delete()
            }
            if (!tempApkFile.renameTo(finalApkFile)) {
                tempApkFile.copyTo(finalApkFile, overwrite = true)
                tempApkFile.delete()
            }

            // Validação de integridade do APK
            when (val result = verifyDownloadedApk(finalApkFile)) {
                is ApkValidationResult.Valid -> {
                    Log.i(TAG, "APK baixado e validado com sucesso: v${result.versionName} (${result.versionCode})")
                    Result.success(finalApkFile)
                }
                is ApkValidationResult.Invalid -> {
                    finalApkFile.delete()
                    Result.failure(Exception("APK corrompido ou incompatível: ${result.reason}"))
                }
            }
        } catch (e: Exception) {
            Log.e(TAG, "Erro durante download do APK: ${e.message}", e)
            if (tempApkFile.exists()) tempApkFile.delete()
            Result.failure(e)
        }
    }

    /**
     * Dispara o instalador oficial do Android para o APK baixado, tratando permissões,
     * suporte a PackageInstaller.Session e fallback resiliente a FileProvider sem interrupção de processo.
     */
    fun installDownloadedApk(onNeedPermission: (() -> Unit)? = null): Boolean {
        try {
            val apkFile = getDownloadedApkFile()
            if (!apkFile.exists() || apkFile.length() == 0L) {
                Toast.makeText(context, "Arquivo de atualização não encontrado.", Toast.LENGTH_LONG).show()
                return false
            }

            // Validação antes de invocar o instalador
            when (val validation = verifyDownloadedApk(apkFile)) {
                is ApkValidationResult.Invalid -> {
                    Toast.makeText(context, "Erro na atualização: ${validation.reason}", Toast.LENGTH_LONG).show()
                    apkFile.delete()
                    return false
                }
                is ApkValidationResult.Valid -> {
                    Log.d(TAG, "APK validado com sucesso: v${validation.versionName} (${validation.versionCode})")
                }
            }

            // No Android 8.0+ (Oreo), verifica permissão para instalar fontes desconhecidas
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                if (!context.packageManager.canRequestPackageInstalls()) {
                    onNeedPermission?.invoke()
                    Toast.makeText(
                        context,
                        "Autorize a instalação de atualizações para o LeFrio nas Configurações.",
                        Toast.LENGTH_LONG
                    ).show()

                    val permissionIntent = Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES).apply {
                        data = Uri.parse("package:${context.packageName}")
                        flags = Intent.FLAG_ACTIVITY_NEW_TASK
                    }
                    context.startActivity(permissionIntent)
                    return false
                }
            }

            // 1. TENTA PRIMEIRO A SESSION DO PackageInstaller NATIVO (Método moderno e atômico no Android 10+)
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                try {
                    val packageInstaller = context.packageManager.packageInstaller
                    val params = PackageInstaller.SessionParams(PackageInstaller.SessionParams.MODE_FULL_INSTALL).apply {
                        setAppPackageName(context.packageName)
                    }
                    val sessionId = packageInstaller.createSession(params)
                    val session = packageInstaller.openSession(sessionId)

                    apkFile.inputStream().use { input ->
                        session.openWrite("lefrio_update_package", 0, apkFile.length()).use { output ->
                            input.copyTo(output)
                            session.fsync(output)
                        }
                    }

                    val callbackIntent = Intent(context, com.lefrio.atendimento.ui.MainActivity::class.java).apply {
                        action = "com.lefrio.atendimento.INSTALL_COMPLETED"
                    }
                    val pendingFlags = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                        PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_MUTABLE
                    } else {
                        PendingIntent.FLAG_UPDATE_CURRENT
                    }
                    val pendingIntent = PendingIntent.getActivity(
                        context,
                        sessionId,
                        callbackIntent,
                        pendingFlags
                    )

                    session.commit(pendingIntent.intentSender)
                    session.close()
                    Log.i(TAG, "Sessão PackageInstaller enviada ao sistema com sucesso!")
                    return true
                } catch (e: Exception) {
                    Log.w(TAG, "PackageInstaller Session falhou, utilizando fallback FileProvider: ${e.message}")
                }
            }

            // 2. FALLBACK SEGURO VIA FileProvider (Sem FLAG_ACTIVITY_CLEAR_TOP para não encerrar o processo que provê o arquivo)
            apkFile.setReadable(true, false)

            val apkUri = FileProvider.getUriForFile(
                context,
                "${context.packageName}.fileprovider",
                apkFile
            )

            val installIntent = Intent(Intent.ACTION_VIEW).apply {
                setDataAndType(apkUri, "application/vnd.android.package-archive")
                addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
                putExtra(Intent.EXTRA_NOT_UNKNOWN_SOURCE, true)
            }

            // Concede permissões explícitas a instaladores do sistema
            val knownInstallers = listOf(
                "com.google.android.packageinstaller",
                "com.android.packageinstaller"
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
            return true
        } catch (e: Exception) {
            Log.e(TAG, "Falha ao abrir instalador do APK: ${e.message}", e)
            Toast.makeText(context, "Falha ao abrir instalador: ${e.message}", Toast.LENGTH_LONG).show()
            return false
        }
    }
}
