package com.lefrio.atendimento.data

import com.google.firebase.FirebaseApp
import com.google.firebase.firestore.FirebaseFirestore

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
}
