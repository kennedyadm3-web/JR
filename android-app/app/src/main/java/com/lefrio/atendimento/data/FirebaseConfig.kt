package com.lefrio.atendimento.data

import com.google.firebase.FirebaseApp
import com.google.firebase.auth.FirebaseAuth
import com.google.firebase.firestore.FirebaseFirestore
import kotlinx.coroutines.tasks.await
import kotlinx.coroutines.withTimeoutOrNull

object FirebaseConfig {
    const val DATABASE_ID = "ai-studio-d7c7baca-4d3e-4f86-a163-d21206f789bc"
    const val SHARED_API_BASE = "https://ais-pre-ar7bordx5nsnyiemayswdy-507910401461.us-west2.run.app"

    fun getFirestore(): FirebaseFirestore {
        return try {
            FirebaseFirestore.getInstance(FirebaseApp.getInstance(), DATABASE_ID)
        } catch (e: Exception) {
            FirebaseFirestore.getInstance()
        }
    }

    suspend fun ensureAuthenticated() {
        val auth = FirebaseAuth.getInstance()
        if (auth.currentUser != null) return
        try {
            withTimeoutOrNull(8_000L) {
                auth.signInWithEmailAndPassword("atendimento@lefrio.com", "123456").await()
            }
        } catch (e: Exception) {
            try {
                withTimeoutOrNull(8_000L) {
                    auth.signInWithEmailAndPassword("admin@lefrio.com", "adminp-password").await()
                }
            } catch (_: Exception) {}
        }
    }
}

