package com.lefrio.atendimento.data.auth

import android.content.Context
import android.content.SharedPreferences
import android.util.Log
import com.google.firebase.FirebaseNetworkException
import com.google.firebase.auth.FirebaseAuth
import com.google.firebase.auth.FirebaseAuthException
import com.google.firebase.auth.FirebaseAuthInvalidCredentialsException
import com.google.firebase.auth.FirebaseAuthInvalidUserException
import com.lefrio.atendimento.data.FirebaseConfig
import com.lefrio.atendimento.data.local.AppDatabase
import com.lefrio.atendimento.data.local.entity.TechnicianEntity
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.tasks.await
import kotlinx.coroutines.withContext

data class TechnicianUser(
    val uid: String,
    val name: String,
    val email: String,
    val role: String = "TECHNICIAN"
)

class AuthRepository(private val context: Context) {

    private val firebaseAuth = FirebaseAuth.getInstance()
    private val db = AppDatabase.getInstance(context)
    private val techDao = db.technicianDao()
    private val prefs: SharedPreferences =
        context.getSharedPreferences("lefrio_auth_prefs", Context.MODE_PRIVATE)

    private val TAG = "AuthRepository"

    companion object {
        // Base oficial sincronizada dos técnicos LeFrio com seus PINs cadastrados no sistema
        val DEFAULT_TECHNICIANS = listOf(
            TechnicianEntity("K10YTjFSrb16rpsWjdE7", "AILTON", "9204", null, null, true),
            TechnicianEntity("2pcr4i9Dyst7vB2Lccyu", "ANDERSON", "1304", null, null, true),
            TechnicianEntity("vLsUVlJ69oCiGTni0ZF7", "ARISSON", "", null, null, true),
            TechnicianEntity("8psUw62Re6jSzjXMolx2", "ARLINDO", "", null, null, true),
            TechnicianEntity("fskp3fm2Xv1RA0eXrYjq", "ATENDIMENTO", "1234", null, null, true),
            TechnicianEntity("AJqJgXkWLkFs6tZQMxga", "BERNARDO", "", null, null, true),
            TechnicianEntity("G9waSM7fu7kuqs2uSvkA", "CARLOS", "", null, null, true),
            TechnicianEntity("NOUKJ2IaBPRsfOF0Yl6y", "EDEILSON", "", null, null, true),
            TechnicianEntity("M956ompZWYCr119dpP8r", "EDMIR", "", null, null, true),
            TechnicianEntity("QaWEAW2ucSs7az9dGjAf", "ERINALDO", "1234", null, null, true),
            TechnicianEntity("joOtmBgGFof93XUHIab6", "GABRIEL BARROSO", "1234", null, null, true),
            TechnicianEntity("B0wWAz4tC6j7hE8GsEPW", "GENILDO", "8511", null, null, true),
            TechnicianEntity("wsHrMwKnYeUTdLvWZQkX", "HELIO (SE)", "6683", null, null, true),
            TechnicianEntity("ICFQin3fznhPrpdBJA0o", "JONAS LEVI", "6486", null, null, true),
            TechnicianEntity("yLwCkvKC1LXHNMJyvDRH", "JOSE CICERO", "5848", null, null, true),
            TechnicianEntity("sTZuCPJqmt8LowJwAkxm", "JOSE ILTON", "2391", null, null, true),
            TechnicianEntity("FPTdzyXhJvQW0QoJy1FF", "KLEBER", "", null, null, true),
            TechnicianEntity("4ylGA5O82Qe48n9q0eRi", "LUIZ", "3737", null, null, true),
            TechnicianEntity("z698EwhYg37LgVoyimpv", "NEWTON", "", null, null, true),
            TechnicianEntity("RvaJGT7kI2e4GOTU5nWJ", "PETRUCIO", "0641", null, null, true),
            TechnicianEntity("Os9W9izjW6RyJ7sYXEpp", "RENATO", "", null, null, true),
            TechnicianEntity("6Fq0GLEOEDek3Fk7xBri", "RYAN", "9231", null, null, true),
            TechnicianEntity("IG9rUvy4ESV3wEfJ0yiT", "WELINGTON", "", null, null, true)
        )
    }

    private fun ensureEmailFormat(input: String): String {
        val clean = input.trim().lowercase()
        if (clean.contains("@")) return clean
        return "$clean@lefrio.com"
    }

    /**
     * Retorna se a conta base do Firebase está logada (ex: atendimento@lefrio.com)
     */
    fun isBaseAccountLoggedIn(): Boolean {
        return prefs.getString("base_user_uid", null) != null || firebaseAuth.currentUser != null
    }

    /**
     * Retorna o técnico específico autenticado via PIN na sessão ativa (ex: ANDERSON, LUIZ, etc.)
     */
    fun getSelectedTechnician(): TechnicianUser? {
        val techId = prefs.getString("selected_tech_id", null) ?: return null
        val techName = prefs.getString("selected_tech_name", "Técnico") ?: "Técnico"
        val techEmail = prefs.getString("selected_tech_email", "") ?: ""
        return TechnicianUser(uid = techId, name = techName, email = techEmail)
    }

    /**
     * Salva o técnico autenticado após validar o PIN
     */
    fun setSelectedTechnician(tech: TechnicianEntity) {
        prefs.edit()
            .putString("selected_tech_id", tech.id)
            .putString("selected_tech_name", tech.name)
            .putString("selected_tech_email", tech.email ?: "")
            .apply()
    }

    /**
     * Limpa o técnico selecionado para permitir nova identificação por PIN
     */
    fun clearSelectedTechnician() {
        prefs.edit()
            .remove("selected_tech_id")
            .remove("selected_tech_name")
            .remove("selected_tech_email")
            .apply()
    }

    /**
     * Login da Conta Base no Firebase (atendimento / senha).
     * Sempre limpa qualquer técnico pré-selecionado para forçar a tela de seleção e PIN logo em seguida!
     */
    suspend fun signInBaseAccount(usernameOrEmail: String, pass: String): Result<Boolean> {
        val targetEmail = ensureEmailFormat(usernameOrEmail)

        return try {
            val result = firebaseAuth.signInWithEmailAndPassword(targetEmail, pass).await()
            val user = result.user ?: throw Exception("Usuário não encontrado.")

            // Limpa o técnico selecionado para que o usuário OBRIGATORIAMENTE escolha o técnico e o PIN
            clearSelectedTechnician()

            prefs.edit()
                .putString("base_user_uid", user.uid)
                .putString("base_user_email", user.email ?: targetEmail)
                .apply()

            // Carrega e atualiza técnicos em cache
            try {
                fetchTechnicians()
            } catch (e: Exception) {
                Log.w(TAG, "Aviso ao carregar técnicos após login base: ${e.message}")
            }

            Result.success(true)
        } catch (e: Exception) {
            val errorMsg = when (e) {
                is FirebaseAuthInvalidUserException -> "Usuário não encontrado. Verifique o usuário informado."
                is FirebaseAuthInvalidCredentialsException -> "Senha incorreta. Verifique suas credenciais."
                is FirebaseNetworkException -> {
                    if (prefs.getString("base_user_uid", null) != null) {
                        clearSelectedTechnician()
                        return Result.success(true)
                    }
                    "Sem conexão com a internet. Conecte-se para o primeiro acesso."
                }
                is FirebaseAuthException -> "Erro de autenticação: ${e.message}"
                else -> e.message ?: "Falha ao entrar no sistema."
            }
            Result.failure(Exception(errorMsg))
        }
    }

    /**
     * Busca a lista de técnicos:
     * 1. Verifica banco Room local. Se vazio, semeia com DEFAULT_TECHNICIANS.
     * 2. Tenta sincronizar com o Firestore em tempo real.
     * 3. Retorna a lista sempre ordenada por nome.
     */
    suspend fun fetchTechnicians(): List<TechnicianEntity> = withContext(Dispatchers.IO) {
        val localList = techDao.getActiveTechniciansSync()
        if (localList.isEmpty()) {
            techDao.insertAll(DEFAULT_TECHNICIANS)
        }

        // Tenta sincronização com o Firestore
        try {
            val firestore = FirebaseConfig.getFirestore()
            val snap = firestore.collection("technicians").get().await()
            if (!snap.isEmpty) {
                val remoteList = mutableListOf<TechnicianEntity>()
                for (doc in snap.documents) {
                    val name = doc.getString("name") ?: continue
                    val pin = (doc.get("pin")?.toString() ?: "").trim()
                    val active = doc.getBoolean("active") ?: true
                    remoteList.add(
                        TechnicianEntity(
                            id = doc.id,
                            name = name,
                            pin = pin,
                            email = doc.getString("email"),
                            phone = doc.getString("phone"),
                            active = active
                        )
                    )
                }
                if (remoteList.isNotEmpty()) {
                    techDao.clearAll()
                    techDao.insertAll(remoteList)
                    return@withContext remoteList.filter { it.active }.sortedBy { it.name }
                }
            }
        } catch (e: Exception) {
            Log.d(TAG, "Sincronização Firestore de técnicos ignorada (offline/erro): ${e.message}")
        }

        val cached = techDao.getActiveTechniciansSync()
        if (cached.isNotEmpty()) {
            return@withContext cached.sortedBy { it.name }
        }
        DEFAULT_TECHNICIANS.sortedBy { it.name }
    }

    /**
     * Valida o PIN do técnico selecionado (idêntico à regra do PWA)
     */
    suspend fun authenticateTechnicianPin(techId: String, pin: String): Result<TechnicianUser> = withContext(Dispatchers.IO) {
        // Busca do banco local Room ou do fallback padrão
        var tech = techDao.getTechnicianById(techId)
        if (tech == null) {
            tech = DEFAULT_TECHNICIANS.find { it.id == techId }
        }

        if (tech == null) {
            return@withContext Result.failure(Exception("Técnico não encontrado no sistema."))
        }

        val storedPin = tech.pin.trim()
        if (storedPin.isBlank()) {
            return@withContext Result.failure(
                Exception("Este técnico não possui PIN de acesso cadastrado. Peça para o administrativo configurar seu PIN.")
            )
        }

        if (storedPin != pin.trim()) {
            return@withContext Result.failure(Exception("PIN incorreto. Tente novamente."))
        }

        // PIN validado com sucesso!
        setSelectedTechnician(tech)

        val techUser = TechnicianUser(
            uid = tech.id,
            name = tech.name,
            email = tech.email ?: "${tech.name.lowercase().replace(" ", "")}@lefrio.com"
        )

        Result.success(techUser)
    }

    fun logoutFull() {
        try {
            firebaseAuth.signOut()
        } catch (e: Exception) {
            Log.w(TAG, "Erro ao deslogar Firebase: ${e.message}")
        }
        prefs.edit().clear().apply()
    }
}
