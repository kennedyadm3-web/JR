package com.lefrio.atendimento.util

import android.app.DownloadManager
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.net.Uri
import android.os.Build
import android.os.Environment
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
import java.io.InputStreamReader
import java.net.HttpURLConnection
import java.net.URL

data class AppUpdateInfo(
    val isAvailable: Boolean = false,
    val latestVersionCode: Long = 1,
    val latestVersionName: String = "1.0.0",
    val downloadUrl: String = "",
    val releaseNotes: String = "",
    val isMandatory: Boolean = false
)

class AppUpdateManager(private val context: Context) {

    private val TAG = "AppUpdateManager"
    private val firestore = FirebaseConfig.getFirestore()
    private val API_VERSION_URL = "${FirebaseConfig.SHARED_API_BASE}/api/android-version"

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

    suspend fun checkForUpdates(): AppUpdateInfo = withContext(Dispatchers.IO) {
        val currentCode = getCurrentVersionCode()

        // 1. Tenta via Firestore no banco de dados correto
        try {
            val doc = firestore.collection("app_config")
                .document("android_version")
                .get()
                .await()

            if (doc.exists()) {
                val remoteVersionCode = doc.getLong("versionCode") ?: 1L
                val remoteVersionName = doc.getString("versionName") ?: "1.0.0"
                val downloadUrl = doc.getString("downloadUrl") ?: ""
                val releaseNotes = doc.getString("releaseNotes") ?: "Melhorias de desempenho e estabilidade."
                val isMandatory = doc.getBoolean("isMandatory") ?: false

                val isNewer = remoteVersionCode > currentCode && downloadUrl.isNotBlank()

                return@withContext AppUpdateInfo(
                    isAvailable = isNewer,
                    latestVersionCode = remoteVersionCode,
                    latestVersionName = remoteVersionName,
                    downloadUrl = downloadUrl,
                    releaseNotes = releaseNotes,
                    isMandatory = isMandatory
                )
            }
        } catch (e: Exception) {
            Log.e(TAG, "Tentativa Firestore falhou: ${e.message}")
        }

        // 2. Fallback via API REST pública do sistema
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
                val remoteVersionCode = json.optLong("versionCode", 1L)
                val remoteVersionName = json.optString("versionName", "1.0.0")
                val downloadUrl = json.optString("downloadUrl", "")
                val releaseNotes = json.optString("releaseNotes", "Melhorias de desempenho e estabilidade.")
                val isMandatory = json.optBoolean("isMandatory", false)

                val isNewer = remoteVersionCode > currentCode && downloadUrl.isNotBlank()

                return@withContext AppUpdateInfo(
                    isAvailable = isNewer,
                    latestVersionCode = remoteVersionCode,
                    latestVersionName = remoteVersionName,
                    downloadUrl = downloadUrl,
                    releaseNotes = releaseNotes,
                    isMandatory = isMandatory
                )
            }
        } catch (e: Exception) {
            Log.e(TAG, "Tentativa REST falhou: ${e.message}")
        }

        AppUpdateInfo(isAvailable = false)
    }

    private fun normalizeDownloadUrl(url: String): String {
        val trimmed = url.trim()
        if (trimmed.contains("drive.google.com/file/d/")) {
            val fileId = trimmed.substringAfter("drive.google.com/file/d/").substringBefore("/")
            return "https://drive.google.com/uc?export=download&id=$fileId"
        }
        return trimmed
    }

    fun getDownloadedApkFile(): File {
        return File(
            context.getExternalFilesDir(Environment.DIRECTORY_DOWNLOADS),
            "lefrio-update.apk"
        )
    }

    fun startDownloadAndInstall(
        downloadUrl: String,
        onDownloadStarted: () -> Unit,
        onDownloadCompleted: () -> Unit
    ) {
        try {
            val targetUrl = normalizeDownloadUrl(downloadUrl)
            val uri = Uri.parse(targetUrl)

            // Remove versão antiga prévia se existir
            val existingApk = getDownloadedApkFile()
            if (existingApk.exists()) {
                existingApk.delete()
            }

            val request = DownloadManager.Request(uri).apply {
                setTitle("Atualização LeFrio Atendimento")
                setDescription("Baixando nova versão do aplicativo...")
                setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED)
                setDestinationInExternalFilesDir(
                    context,
                    Environment.DIRECTORY_DOWNLOADS,
                    "lefrio-update.apk"
                )
                setMimeType("application/vnd.android.package-archive")
            }

            val downloadManager = context.getSystemService(Context.DOWNLOAD_SERVICE) as DownloadManager
            val downloadId = downloadManager.enqueue(request)

            onDownloadStarted()

            val onCompleteReceiver = object : BroadcastReceiver() {
                override fun onReceive(ctxt: Context?, intent: Intent?) {
                    val id = intent?.getLongExtra(DownloadManager.EXTRA_DOWNLOAD_ID, -1L)
                    if (id == downloadId) {
                        try {
                            context.unregisterReceiver(this)
                        } catch (_: Exception) {}

                        onDownloadCompleted()
                        installDownloadedApk()
                    }
                }
            }

            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                context.registerReceiver(
                    onCompleteReceiver,
                    IntentFilter(DownloadManager.ACTION_DOWNLOAD_COMPLETE),
                    Context.RECEIVER_EXPORTED
                )
            } else {
                context.registerReceiver(
                    onCompleteReceiver,
                    IntentFilter(DownloadManager.ACTION_DOWNLOAD_COMPLETE)
                )
            }
        } catch (e: Exception) {
            Log.e(TAG, "Erro ao iniciar download da atualização: ${e.message}")
            Toast.makeText(context, "Erro ao iniciar download: ${e.message}", Toast.LENGTH_LONG).show()
        }
    }

    /**
     * Dispara o instalador do Android para o APK baixado, tratando permissões no Android 8.0+.
     */
    fun installDownloadedApk() {
        try {
            val apkFile = getDownloadedApkFile()
            if (!apkFile.exists() || apkFile.length() == 0L) {
                Toast.makeText(context, "Arquivo de atualização não encontrado ou incompleto.", Toast.LENGTH_LONG).show()
                return
            }

            // No Android 8.0+ (Oreo), verifica se a instalação de fontes desconhecidas foi concedida
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                if (!context.packageManager.canRequestPackageInstalls()) {
                    Toast.makeText(context, "Por favor, autorize a instalação de atualizações para a LeFrio.", Toast.LENGTH_LONG).show()
                    val permissionIntent = Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES).apply {
                        data = Uri.parse("package:${context.packageName}")
                        flags = Intent.FLAG_ACTIVITY_NEW_TASK
                    }
                    context.startActivity(permissionIntent)
                    return
                }
            }

            val apkUri = FileProvider.getUriForFile(
                context,
                "${context.packageName}.fileprovider",
                apkFile
            )

            val installIntent = Intent(Intent.ACTION_VIEW).apply {
                setDataAndType(apkUri, "application/vnd.android.package-archive")
                flags = Intent.FLAG_ACTIVITY_NEW_TASK or
                        Intent.FLAG_GRANT_READ_URI_PERMISSION or
                        Intent.FLAG_ACTIVITY_CLEAR_TOP
            }

            context.startActivity(installIntent)
        } catch (e: Exception) {
            Log.e(TAG, "Falha ao abrir instalador do APK: ${e.message}", e)
            Toast.makeText(context, "Falha ao abrir instalador: ${e.message}", Toast.LENGTH_LONG).show()
        }
    }
}
