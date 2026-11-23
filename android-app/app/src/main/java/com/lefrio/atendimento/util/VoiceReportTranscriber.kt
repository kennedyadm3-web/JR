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
 * Gerenciador dedicado à gravação e transcrição de áudio em Português (pt-BR)
 * exclusivamente para o campo de Relatório Técnico do atendimento preventivo.
 *
 * Mantém escuta contínua até o técnico tocar em "Parar", com visualização parcial
 * em tempo real, nível de áudio (RMS) e fallback seguro caso o serviço inline
 * não esteja disponível no aparelho.
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
            putExtra(RecognizerIntent.EXTRA_SPEECH_INPUT_COMPLETE_SILENCE_LENGTH_MILLIS, 3500L)
            putExtra(RecognizerIntent.EXTRA_SPEECH_INPUT_POSSIBLY_COMPLETE_SILENCE_LENGTH_MILLIS, 2500L)
            putExtra(RecognizerIntent.EXTRA_PROMPT, "Fale o relatório técnico do atendimento...")
        }
    }

    fun start() {
        mainHandler.post {
            if (isListeningRequested) return@post

            if (!SpeechRecognizer.isRecognitionAvailable(context)) {
                onFallbackToSystemIntent()
                return@post
            }

            isListeningRequested = true
            lastPartialText = ""
            consecutiveErrorCount = 0
            onListeningStateChanged(true)
            onPartialTranscript("")
            startSingleListeningCycle()
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
                    onFinalSegment(pendingPartial.uppercase(Locale("pt", "BR")))
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
        mainHandler.post {
            isListeningRequested = false
            lastPartialText = ""
            mainHandler.removeCallbacks(restartRunnable)
            onAudioLevelChanged(0f)
            destroyRecognizerInternal()
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
                    // Normaliza o nível de volume do microfone para 0f..1f
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

                    // Se houver texto parcial antes de expirar o silêncio, confirma no campo
                    val pending = lastPartialText.trim()
                    if (pending.isNotBlank()) {
                        lastPartialText = ""
                        onPartialTranscript("")
                        onFinalSegment(pending.uppercase(Locale("pt", "BR")))
                    }

                    when (error) {
                        SpeechRecognizer.ERROR_NO_MATCH,
                        SpeechRecognizer.ERROR_SPEECH_TIMEOUT -> {
                            // Continua gravando automaticamente após pequenas pausas do técnico
                            scheduleRestart(250L)
                        }
                        SpeechRecognizer.ERROR_RECOGNIZER_BUSY -> {
                            consecutiveErrorCount++
                            if (consecutiveErrorCount <= 2) {
                                scheduleRestart(500L)
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
                            stopWithError("Sem conexão com o serviço de transcrição de voz. Verifique a internet ou o pacote offline de português no aparelho.")
                        }
                        else -> {
                            // Fallback transparente para o diálogo nativo de voz do Android
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
                    lastPartialText = ""
                    onPartialTranscript("")

                    if (bestText.isNotBlank()) {
                        onFinalSegment(bestText.uppercase(Locale("pt", "BR")))
                    }

                    // Mantém escuta ativa até o técnico clicar em "Parar"
                    if (isListeningRequested) {
                        scheduleRestart(220L)
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
