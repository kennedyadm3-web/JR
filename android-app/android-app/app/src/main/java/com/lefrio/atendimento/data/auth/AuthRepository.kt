package com.lefrio.atendimento.data.auth

import android.content.Context
import android.content.SharedPreferences
import com.google.firebase.auth.FirebaseAuth
import kotlinx.coroutines.tasks.await

data class TechnicianUser(
    val uid: String,
    val name: String,
    val email: String,
    val role: String = "TECHNICIAN"
)

class AuthRepository(private val context: Context) {

    private val firebaseAuth = FirebaseAuth.getInstance()
    private val prefs: SharedPreferences =
        context.getSharedPreferences("lefrio_auth_prefs", Context.MODE_PRIVATE)

    fun getCurrentUser(): TechnicianUser? {
        val uid = prefs.getString("user_uid", null) ?: return null
        val name = prefs.getString("user_name", "Técnico") ?: "Técnico"
        val email = prefs.getString("user_email", "") ?: ""
        return TechnicianUser(uid = uid, name = name, email = email)
    }

    suspend fun signIn(email: String, pass: String): Result<TechnicianUser> {
        return try {
            val result = firebaseAuth.signInWithEmailAndPassword(email.trim(), pass).await()
            val user = result.user ?: throw Exception("Usuário não encontrado.")

            val techUser = TechnicianUser(
                uid = user.uid,
                name = user.displayName ?: user.email?.substringBefore("@") ?: "Técnico",
                email = user.email ?: email
            )

            // Salva credenciais locais para permitir uso offline subsequente
            prefs.edit()
                .putString("user_uid", techUser.uid)
                .putString("user_name", techUser.name)
                .putString("user_email", techUser.email)
                .apply()

            Result.success(techUser)
        } catch (e: Exception) {
            // Se falhar a conexão mas o usuário já tiver logado com este e-mail antes, permite login offline
            val cachedUser = getCurrentUser()
            if (cachedUser != null && cachedUser.email.equals(email.trim(), ignoreCase = true)) {
                Result.success(cachedUser)
            } else {
                Result.failure(e)
            }
        }
    }

    fun signOut() {
        firebaseAuth.signOut()
        prefs.edit().clear().apply()
    }
}
