package com.lefrio.atendimento.util

import android.app.DownloadManager
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.net.Uri
import android.os.Build
import android.os.Environment
import android.util.Log
import androidx.core.content.FileProvider
import com.google.firebase.firestore.FirebaseFirestore
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.tasks.await
import kotlinx.coroutines.withContext
import java.io.File

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
    private val firestore = FirebaseFirestore.getInstance()

    /**
     * Retorna o código numérico da versão instalada no aparelho.
     */
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

    /**
     * Retorna o nome da versão instalada (ex: "1.0.0").
     */
    fun getCurrentVersionName(): String {
        return try {
            val pInfo = context.packageManager.getPackageInfo(context.packageName, 0)
            pInfo.versionName ?: "1.0.0"
        } catch (e: Exception) {
            "1.0.0"
        }
    }

    /**
     * Verifica no Firestore se existe uma versão mais recente do aplicativo Android.
     */
    suspend fun checkForUpdates(): AppUpdateInfo = withContext(Dispatchers.IO) {
        try {
            val doc = firestore.collection("app_config")
                .document("android_version")
                .get()
                .await()

            if (!doc.exists()) {
                return@withContext AppUpdateInfo(isAvailable = false)
            }

            val remoteVersionCode = doc.getLong("versionCode") ?: 1L
            val remoteVersionName = doc.getString("versionName") ?: "1.0.0"
            val downloadUrl = doc.getString("downloadUrl") ?: ""
            val releaseNotes = doc.getString("releaseNotes") ?: "Melhorias de desempenho e estabilidade."
            val isMandatory = doc.getBoolean("isMandatory") ?: false

            val currentCode = getCurrentVersionCode()

            val isNewer = remoteVersionCode > currentCode && downloadUrl.isNotBlank()

            AppUpdateInfo(
                isAvailable = isNewer,
                latestVersionCode = remoteVersionCode,
                latestVersionName = remoteVersionName,
                downloadUrl = downloadUrl,
                releaseNotes = releaseNotes,
                isMandatory = isMandatory
            )
        } catch (e: Exception) {
            Log.e(TAG, "Falha ao verificar atualizações: ${e.message}")
            AppUpdateInfo(isAvailable = false)
        }
    }

    /**
     * Baixa o novo APK usando o DownloadManager nativo do Android e dispara a instalação.
     */
    fun startDownloadAndInstall(downloadUrl: String, onDownloadStarted: () -> Unit) {
        try {
            val uri = Uri.parse(downloadUrl)
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

            // Monitora a conclusão do download para iniciar o instalador do Android
            val onCompleteReceiver = object : BroadcastReceiver() {
                override fun onReceive(ctxt: Context?, intent: Intent?) {
                    val id = intent?.getLongExtra(DownloadManager.EXTRA_DOWNLOAD_ID, -1L)
                    if (id == downloadId) {
                        try {
                            context.unregisterReceiver(this)
                        } catch (_: Exception) {}

                        installApk()
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
        }
    }

    /**
     * Abre a tela nativa do Android para o usuário confirmar a instalação da nova versão.
     */
    private fun installApk() {
        try {
            val apkFile = File(
                context.getExternalFilesDir(Environment.DIRECTORY_DOWNLOADS),
                "lefrio-update.apk"
            )

            if (!apkFile.exists()) {
                Log.e(TAG, "Arquivo APK não encontrado para instalação.")
                return
            }

            val apkUri = FileProvider.getUriForFile(
                context,
                "${context.packageName}.fileprovider",
                apkFile
            )

            val installIntent = Intent(Intent.ACTION_VIEW).apply {
                setDataAndType(apkUri, "application/vnd.android.package-archive")
                flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_GRANT_READ_URI_PERMISSION
            }

            context.startActivity(installIntent)
        } catch (e: Exception) {
            Log.e(TAG, "Falha ao abrir instalador do APK: ${e.message}", e)
        }
    }
}
