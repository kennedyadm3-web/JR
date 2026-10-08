package com.lefrio.atendimento.data.auth

import android.content.Context
import android.content.SharedPreferences
import com.google.firebase.FirebaseNetworkException
import com.google.firebase.auth.FirebaseAuth
import com.google.firebase.auth.FirebaseAuthException
import com.google.firebase.auth.FirebaseAuthInvalidCredentialsException
import com.google.firebase.auth.FirebaseAuthInvalidUserException
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

    /**
     * Mesma regra de formatação de e-mail do sistema PWA:
     * Se o técnico digitar apenas 'atendimento', converte automaticamente para 'atendimento@lefrio.com'
     */
    private fun ensureEmailFormat(input: String): String {
        val clean = input.trim().lowercase()
        if (clean.contains("@")) return clean
        return "$clean@lefrio.com"
    }

    fun getCurrentUser(): TechnicianUser? {
        val uid = prefs.getString("user_uid", null) ?: return null
        val name = prefs.getString("user_name", "Técnico") ?: "Técnico"
        val email = prefs.getString("user_email", "") ?: ""
        return TechnicianUser(uid = uid, name = name, email = email)
    }

    suspend fun signIn(usernameOrEmail: String, pass: String): Result<TechnicianUser> {
        val targetEmail = ensureEmailFormat(usernameOrEmail)

        return try {
            val result = firebaseAuth.signInWithEmailAndPassword(targetEmail, pass).await()
            val user = result.user ?: throw Exception("Usuário não encontrado.")

            val techUser = TechnicianUser(
                uid = user.uid,
                name = user.displayName ?: user.email?.substringBefore("@")?.replaceFirstChar { it.uppercase() } ?: "Técnico",
                email = user.email ?: targetEmail
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
            if (cachedUser != null && cachedUser.email.equals(targetEmail, ignoreCase = true)) {
                return Result.success(cachedUser)
            }

            val friendlyMessage = when (e) {
                is FirebaseAuthInvalidUserException,
                is FirebaseAuthInvalidCredentialsException -> "Usuário ou senha incorretos."
                is FirebaseNetworkException -> "Erro de conexão. Verifique sua internet."
                is FirebaseAuthException -> {
                    when (e.errorCode) {
                        "ERROR_USER_NOT_FOUND", "ERROR_WRONG_PASSWORD", "ERROR_INVALID_CREDENTIAL" -> "Usuário ou senha incorretos."
                        "ERROR_INVALID_EMAIL" -> "Formato de usuário ou e-mail inválido."
                        "ERROR_NETWORK_REQUEST_FAILED" -> "Erro de conexão. Verifique sua internet."
                        else -> "Usuário ou senha incorretos."
                    }
                }
                else -> e.message ?: "Erro ao entrar no sistema."
            }

            Result.failure(Exception(friendlyMessage))
        }
    }

    fun signOut() {
        firebaseAuth.signOut()
        prefs.edit().clear().apply()
    }
}
