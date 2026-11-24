package com.lefrio.atendimento.util

import android.content.Context
import android.content.Intent
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.speech.RecognitionListener
import android.speech.RecognizerIntent
import android.speech.SpeechRecognizer
import java.util.Locale

/**
 * Gerenciador dedicado à gravação e transcrição contínua de áudio em Português (pt-BR)
 * exclusivamente para o campo de Relatório Técnico do atendimento preventivo.
 *
 * Adaptado para relatórios técnicos longos:
 * - Janelas estendidas de silêncio para pausas naturais de raciocínio do técnico;
 * - Reinício contínuo automático entre frases sem perder texto anterior;
 * - Proteção contra duplicação de segmentos ao parar a gravação;
 * - Confirmação imediata de parciais pendentes antes de encerrar ou reiniciar;
 * - Fallback seguro para o diálogo nativo do Android quando necessário.
 */
class VoiceReportTranscriber(
    private val context: Context,
    private val onListeningStateChanged: (Boolean) -> Unit,
    private val onPartialTranscript: (String) -> Unit,
    private val onFinalSegment: (String) -> Unit,
    private val onAudioLevelChanged: (Float) -> Unit,
    private val onError: (String) -> Unit,
    private val onFallbackToSystemIntent: () -> Unit
) {
    private val mainHandler = Handler(Looper.getMainLooper())
    private var speechRecognizer: SpeechRecognizer? = null
    private var isListeningRequested = false
    private var lastPartialText = ""
    private var lastCommittedNormalized = ""
    private var lastCommittedAtMs = 0L
    private var consecutiveErrorCount = 0

    private val restartRunnable = Runnable {
        if (isListeningRequested) {
            startSingleListeningCycle()
        }
    }

    fun isListening(): Boolean = isListeningRequested

    fun buildRecognizerIntent(): Intent {
        return Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH).apply {
            putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM)
            putExtra(RecognizerIntent.EXTRA_LANGUAGE, "pt-BR")
            putExtra(RecognizerIntent.EXTRA_LANGUAGE_PREFERENCE, "pt-BR")
            putExtra(RecognizerIntent.EXTRA_ONLY_RETURN_LANGUAGE_PREFERENCE, false)
            putExtra(RecognizerIntent.EXTRA_PARTIAL_RESULTS, true)
            putExtra(RecognizerIntent.EXTRA_MAX_RESULTS, 1)
            putExtra(RecognizerIntent.EXTRA_CALLING_PACKAGE, context.packageName)
            // Janelas amplas para relatórios técnicos extensos com pausas entre frases
            putExtra(RecognizerIntent.EXTRA_SPEECH_INPUT_MINIMUM_LENGTH_MILLIS, 3000L)
            putExtra(RecognizerIntent.EXTRA_SPEECH_INPUT_COMPLETE_SILENCE_LENGTH_MILLIS, 5000L)
            putExtra(RecognizerIntent.EXTRA_SPEECH_INPUT_POSSIBLY_COMPLETE_SILENCE_LENGTH_MILLIS, 3500L)
            putExtra(RecognizerIntent.EXTRA_PROMPT, "Fale o relatório técnico completo do atendimento...")
        }
    }

    private fun commitSegmentSafely(rawText: String) {
        val clean = rawText.trim().uppercase(Locale("pt", "BR"))
        if (clean.isBlank()) return

        val now = System.currentTimeMillis()
        // Evita duplicação caso onPartialResults + onResults disparem com o mesmo trecho no encerramento
        if (clean == lastCommittedNormalized && (now - lastCommittedAtMs) < 1500L) {
            return
        }
        lastCommittedNormalized = clean
        lastCommittedAtMs = now
        onFinalSegment(clean)
    }

    fun start() {
        val action = {
            if (!isListeningRequested) {
                if (!SpeechRecognizer.isRecognitionAvailable(context)) {
                    onFallbackToSystemIntent()
                } else {
                    isListeningRequested = true
                    lastPartialText = ""
                    consecutiveErrorCount = 0
                    onListeningStateChanged(true)
                    onPartialTranscript("")
                    startSingleListeningCycle()
                }
            }
        }
        if (Looper.myLooper() == Looper.getMainLooper()) {
            action()
        } else {
            mainHandler.post(action)
        }
    }

    fun stop() {
        val action = {
            if (isListeningRequested) {
                isListeningRequested = false
                mainHandler.removeCallbacks(restartRunnable)

                val pendingPartial = lastPartialText.trim()
                lastPartialText = ""

                try {
                    speechRecognizer?.stopListening()
                } catch (_: Exception) {
                }

                if (pendingPartial.isNotBlank()) {
                    commitSegmentSafely(pendingPartial)
                }

                onPartialTranscript("")
                onAudioLevelChanged(0f)
                onListeningStateChanged(false)
                destroyRecognizerInternal()
            }
        }
        if (Looper.myLooper() == Looper.getMainLooper()) {
            action()
        } else {
            mainHandler.post(action)
        }
    }

    fun release() {
        val action = {
            isListeningRequested = false
            lastPartialText = ""
            mainHandler.removeCallbacks(restartRunnable)
            onAudioLevelChanged(0f)
            destroyRecognizerInternal()
        }
        if (Looper.myLooper() == Looper.getMainLooper()) {
            action()
        } else {
            mainHandler.post(action)
        }
    }

    private fun startSingleListeningCycle() {
        try {
            destroyRecognizerInternal()
            val recognizer = SpeechRecognizer.createSpeechRecognizer(context)
            recognizer.setRecognitionListener(object : RecognitionListener {
                override fun onReadyForSpeech(params: Bundle?) {
                    consecutiveErrorCount = 0
                }

                override fun onBeginningOfSpeech() {}

                override fun onRmsChanged(rmsdB: Float) {
                    val normalized = ((rmsdB + 2f) / 12f).coerceIn(0f, 1f)
                    onAudioLevelChanged(normalized)
                }

                override fun onBufferReceived(buffer: ByteArray?) {}

                override fun onEndOfSpeech() {
                    onAudioLevelChanged(0f)
                }

                override fun onError(error: Int) {
                    onAudioLevelChanged(0f)
                    if (!isListeningRequested) return

                    // Nunca perde o que já estava sendo reconhecido antes da pausa/erro
                    val pending = lastPartialText.trim()
                    if (pending.isNotBlank()) {
                        lastPartialText = ""
                        onPartialTranscript("")
                        commitSegmentSafely(pending)
                    }

                    when (error) {
                        SpeechRecognizer.ERROR_NO_MATCH,
                        SpeechRecognizer.ERROR_SPEECH_TIMEOUT -> {
                            // Mantém gravação contínua para relatórios longos até o técnico tocar em "Parar"
                            scheduleRestart(220L)
                        }
                        SpeechRecognizer.ERROR_RECOGNIZER_BUSY -> {
                            consecutiveErrorCount++
                            if (consecutiveErrorCount <= 3) {
                                scheduleRestart(450L)
                            } else {
                                stopWithError("Microfone ocupado no momento. Tente novamente.")
                            }
                        }
                        SpeechRecognizer.ERROR_AUDIO -> {
                            stopWithError("Não foi possível capturar o áudio do microfone.")
                        }
                        SpeechRecognizer.ERROR_INSUFFICIENT_PERMISSIONS -> {
                            stopWithError("Permissão de microfone necessária para gravar o relatório.")
                        }
                        SpeechRecognizer.ERROR_NETWORK,
                        SpeechRecognizer.ERROR_NETWORK_TIMEOUT,
                        SpeechRecognizer.ERROR_SERVER -> {
                            stopWithError("Aparelho offline ou sem pacote de voz offline (Português) instalado. Você pode digitar o relatório normalmente offline.")
                        }
                        else -> {
                            isListeningRequested = false
                            mainHandler.removeCallbacks(restartRunnable)
                            onPartialTranscript("")
                            onListeningStateChanged(false)
                            destroyRecognizerInternal()
                            onFallbackToSystemIntent()
                        }
                    }
                }

                override fun onResults(results: Bundle?) {
                    onAudioLevelChanged(0f)
                    val matches = results?.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION)
                    val bestText = matches?.firstOrNull()?.trim().orEmpty()
                    val fallbackPartial = lastPartialText.trim()
                    lastPartialText = ""
                    onPartialTranscript("")

                    val textToCommit = bestText.ifBlank { fallbackPartial }
                    if (textToCommit.isNotBlank()) {
                        commitSegmentSafely(textToCommit)
                    }

                    // Continua gravando automaticamente para relatórios extensos
                    if (isListeningRequested) {
                        scheduleRestart(200L)
                    }
                }

                override fun onPartialResults(partialResults: Bundle?) {
                    if (!isListeningRequested) return
                    val matches = partialResults?.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION)
                    val partial = matches?.firstOrNull()?.trim().orEmpty()
                    if (partial.isNotBlank()) {
                        lastPartialText = partial
                        onPartialTranscript(partial.uppercase(Locale("pt", "BR")))
                    }
                }

                override fun onEvent(eventType: Int, params: Bundle?) {}
            })

            speechRecognizer = recognizer
            recognizer.startListening(buildRecognizerIntent())
        } catch (_: Throwable) {
            isListeningRequested = false
            onPartialTranscript("")
            onAudioLevelChanged(0f)
            onListeningStateChanged(false)
            destroyRecognizerInternal()
            onFallbackToSystemIntent()
        }
    }

    private fun scheduleRestart(delayMs: Long) {
        mainHandler.removeCallbacks(restartRunnable)
        mainHandler.postDelayed(restartRunnable, delayMs)
    }

    private fun stopWithError(message: String) {
        isListeningRequested = false
        lastPartialText = ""
        mainHandler.removeCallbacks(restartRunnable)
        onPartialTranscript("")
        onAudioLevelChanged(0f)
        onListeningStateChanged(false)
        destroyRecognizerInternal()
        onError(message)
    }

    private fun destroyRecognizerInternal() {
        try {
            speechRecognizer?.cancel()
            speechRecognizer?.destroy()
        } catch (_: Exception) {
        } finally {
            speechRecognizer = null
        }
    }
}
