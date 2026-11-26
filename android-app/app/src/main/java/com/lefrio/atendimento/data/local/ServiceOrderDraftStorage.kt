package com.lefrio.atendimento.data.local

import android.content.Context
import org.json.JSONArray
import org.json.JSONObject
import java.io.File
import java.util.UUID
import kotlin.math.ceil

data class LocalServiceOrderDraft(
    val id: String = "DRAFT_${System.currentTimeMillis()}_${UUID.randomUUID().toString().take(6)}",
    val technicianId: String,
    val technicianName: String,
    val clientId: String = "",
    val clientName: String = "",
    val addressId: String = "",
    val addressStreet: String = "",
    val equipmentId: String = "",
    val equipmentName: String = "",
    val equipmentDisplay: String = "",
    val equipmentBrand: String = "",
    val equipmentBtus: String = "",
    val equipmentSector: String = "",
    val description: String = "",
    val diagnosis: String = "",
    val solution: String = "",
    val technicalReport: String = "",
    val fiscalName: String = "",
    val fiscalRegistration: String = "",
    val fiscalRole: String = "",
    val fiscalContact: String = "",
    val photoPaths: List<String> = emptyList(),
    val createdAtMillis: Long = System.currentTimeMillis(),
    val updatedAtMillis: Long = System.currentTimeMillis(),
    val expiresAtMillis: Long = System.currentTimeMillis() + ServiceOrderDraftStorage.RETENTION_MILLIS
)

/**
 * Armazena rascunhos de Ordens de Serviço diretamente na memória interna do dispositivo
 * com retenção automática de até 7 dias.
 */
class ServiceOrderDraftStorage(private val context: Context) {

    companion object {
        const val RETENTION_DAYS = 7
        const val ONE_DAY_MILLIS = 24L * 60L * 60L * 1000L
        const val RETENTION_MILLIS = RETENTION_DAYS * ONE_DAY_MILLIS
        private const val FILE_NAME = "service_order_drafts_v1.json"

        fun remainingDays(draft: LocalServiceOrderDraft, nowMillis: Long = System.currentTimeMillis()): Int {
            val diff = draft.expiresAtMillis - nowMillis
            if (diff <= 0L) return 0
            return ceil(diff.toDouble() / ONE_DAY_MILLIS.toDouble()).toInt().coerceIn(1, RETENTION_DAYS)
        }

        fun formatExpirationLabel(draft: LocalServiceOrderDraft, nowMillis: Long = System.currentTimeMillis()): String {
            val diff = draft.expiresAtMillis - nowMillis
            if (diff <= 0L) return "Expirando hoje"
            if (diff < ONE_DAY_MILLIS) return "Expira hoje"
            val days = remainingDays(draft, nowMillis)
            return if (days == 1) "Expira em 1 dia" else "Expira em $days dias"
        }
    }

    private val storageFile: File
        get() = File(context.filesDir, FILE_NAME)

    @Synchronized
    fun getActiveDrafts(technicianId: String, technicianName: String): List<LocalServiceOrderDraft> {
        val allActive = readAllAndPurgeExpired()
        val normalizedTechId = technicianId.trim()
        val normalizedTechName = technicianName.trim()

        return allActive
            .filter { draft ->
                (normalizedTechId.isNotEmpty() && draft.technicianId == normalizedTechId) ||
                    (normalizedTechName.isNotEmpty() && draft.technicianName.equals(normalizedTechName, ignoreCase = true))
            }
            .sortedByDescending { it.updatedAtMillis }
    }

    @Synchronized
    fun saveDraft(draft: LocalServiceOrderDraft): LocalServiceOrderDraft {
        val now = System.currentTimeMillis()
        val allActive = readAllAndPurgeExpired().toMutableList()
        val existing = allActive.firstOrNull { it.id == draft.id }

        val updatedDraft = draft.copy(
            photoPaths = draft.photoPaths.filter { path ->
                path.isNotBlank() && File(path).exists()
            },
            createdAtMillis = existing?.createdAtMillis ?: draft.createdAtMillis.takeIf { it > 0L } ?: now,
            updatedAtMillis = now,
            expiresAtMillis = now + RETENTION_MILLIS
        )

        allActive.removeAll { it.id == updatedDraft.id }
        allActive.add(0, updatedDraft)
        writeAll(allActive)
        return updatedDraft
    }

    @Synchronized
    fun deleteDraft(draftId: String) {
        val allActive = readAllAndPurgeExpired().toMutableList()
        val removed = allActive.removeAll { it.id == draftId }
        if (removed) {
            writeAll(allActive)
        }
    }

    @Synchronized
    fun purgeExpiredDrafts() {
        readAllAndPurgeExpired()
    }

    private fun readAllAndPurgeExpired(): List<LocalServiceOrderDraft> {
        val file = storageFile
        if (!file.exists()) return emptyList()

        return try {
            val raw = file.readText(Charsets.UTF_8)
            if (raw.isBlank()) return emptyList()

            val now = System.currentTimeMillis()
            val array = JSONArray(raw)
            val validList = mutableListOf<LocalServiceOrderDraft>()
            var hadExpiredOrInvalid = false

            for (i in 0 until array.length()) {
                val obj = array.optJSONObject(i) ?: continue
                val draft = fromJson(obj)
                if (draft.expiresAtMillis > now) {
                    validList.add(draft)
                } else {
                    hadExpiredOrInvalid = true
                }
            }

            if (hadExpiredOrInvalid) {
                writeAll(validList)
            }

            validList
        } catch (_: Exception) {
            emptyList()
        }
    }

    private fun writeAll(drafts: List<LocalServiceOrderDraft>) {
        try {
            val array = JSONArray()
            drafts.forEach { draft ->
                array.put(toJson(draft))
            }

            val target = storageFile
            val tempFile = File(context.filesDir, "$FILE_NAME.tmp")
            tempFile.writeText(array.toString(), Charsets.UTF_8)
            if (!tempFile.renameTo(target)) {
                target.writeText(array.toString(), Charsets.UTF_8)
                tempFile.delete()
            }
        } catch (_: Exception) {
            // Falha silenciosa de I/O não deve derrubar a UI
        }
    }

    private fun toJson(draft: LocalServiceOrderDraft): JSONObject {
        val photosArray = JSONArray()
        draft.photoPaths.forEach { photosArray.put(it) }

        return JSONObject().apply {
            put("id", draft.id)
            put("technicianId", draft.technicianId)
            put("technicianName", draft.technicianName)
            put("clientId", draft.clientId)
            put("clientName", draft.clientName)
            put("addressId", draft.addressId)
            put("addressStreet", draft.addressStreet)
            put("equipmentId", draft.equipmentId)
            put("equipmentName", draft.equipmentName)
            put("equipmentDisplay", draft.equipmentDisplay)
            put("equipmentBrand", draft.equipmentBrand)
            put("equipmentBtus", draft.equipmentBtus)
            put("equipmentSector", draft.equipmentSector)
            put("description", draft.description)
            put("diagnosis", draft.diagnosis)
            put("solution", draft.solution)
            put("technicalReport", draft.technicalReport)
            put("fiscalName", draft.fiscalName)
            put("fiscalRegistration", draft.fiscalRegistration)
            put("fiscalRole", draft.fiscalRole)
            put("fiscalContact", draft.fiscalContact)
            put("photoPaths", photosArray)
            put("createdAtMillis", draft.createdAtMillis)
            put("updatedAtMillis", draft.updatedAtMillis)
            put("expiresAtMillis", draft.expiresAtMillis)
        }
    }

    private fun fromJson(obj: JSONObject): LocalServiceOrderDraft {
        val photosArray = obj.optJSONArray("photoPaths")
        val existingPhotos = mutableListOf<String>()
        if (photosArray != null) {
            for (i in 0 until photosArray.length()) {
                val path = photosArray.optString(i, "")
                if (path.isNotBlank() && File(path).exists()) {
                    existingPhotos.add(path)
                }
            }
        }

        val now = System.currentTimeMillis()
        val created = obj.optLong("createdAtMillis", now)
        val updated = obj.optLong("updatedAtMillis", created)
        val expires = obj.optLong("expiresAtMillis", updated + RETENTION_MILLIS)

        return LocalServiceOrderDraft(
            id = obj.optString("id").ifBlank { "DRAFT_${updated}_${UUID.randomUUID().toString().take(6)}" },
            technicianId = obj.optString("technicianId", ""),
            technicianName = obj.optString("technicianName", ""),
            clientId = obj.optString("clientId", ""),
            clientName = obj.optString("clientName", ""),
            addressId = obj.optString("addressId", ""),
            addressStreet = obj.optString("addressStreet", ""),
            equipmentId = obj.optString("equipmentId", ""),
            equipmentName = obj.optString("equipmentName", ""),
            equipmentDisplay = obj.optString("equipmentDisplay", ""),
            equipmentBrand = obj.optString("equipmentBrand", ""),
            equipmentBtus = obj.optString("equipmentBtus", ""),
            equipmentSector = obj.optString("equipmentSector", ""),
            description = obj.optString("description", ""),
            diagnosis = obj.optString("diagnosis", ""),
            solution = obj.optString("solution", ""),
            technicalReport = obj.optString("technicalReport", ""),
            fiscalName = obj.optString("fiscalName", ""),
            fiscalRegistration = obj.optString("fiscalRegistration", ""),
            fiscalRole = obj.optString("fiscalRole", ""),
            fiscalContact = obj.optString("fiscalContact", ""),
            photoPaths = existingPhotos,
            createdAtMillis = created,
            updatedAtMillis = updated,
            expiresAtMillis = expires
        )
    }
}
