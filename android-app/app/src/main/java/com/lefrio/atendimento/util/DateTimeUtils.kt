package com.lefrio.atendimento.util

import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import java.util.TimeZone

object DateTimeUtils {

    /**
     * Formata data e hora para exibição amigável: "24/10/2026 às 18:45"
     */
    fun formatDisplayDateTime(dateStr: String?): String {
        if (dateStr.isNullOrBlank()) return ""
        if (dateStr.contains("/") && dateStr.contains(":")) {
            return dateStr
        }
        val date = parseFlexible(dateStr) ?: return dateStr
        return SimpleDateFormat("dd/MM/yyyy 'às' HH:mm", Locale.getDefault()).format(date)
    }

    /**
     * Formata apenas a data: "22/11/2026"
     */
    fun formatDisplayDate(dateStr: String?): String {
        if (dateStr.isNullOrBlank()) return ""
        val trimmed = dateStr.trim()
        if (trimmed.length == 10 && trimmed[2] == '/' && trimmed[5] == '/') {
            return trimmed
        }
        val isoPart = trimmed.take(10)
        if (isoPart.length == 10 && isoPart[4] == '-' && isoPart[7] == '-') {
            val parts = isoPart.split("-")
            if (parts.size == 3) {
                return "${parts[2]}/${parts[1]}/${parts[0]}"
            }
        }
        val date = parseFlexible(trimmed) ?: return trimmed
        return SimpleDateFormat("dd/MM/yyyy", Locale.getDefault()).format(date)
    }

    /**
     * Formata apenas a hora e minutos: "18:45"
     */
    fun formatDisplayTime(dateStr: String?): String {
        if (dateStr.isNullOrBlank()) return ""
        val date = parseFlexible(dateStr)
        if (date != null) {
            return SimpleDateFormat("HH:mm", Locale.getDefault()).format(date)
        }
        if (dateStr.contains(":")) {
            val parts = dateStr.trim().split(" ")
            val timePart = parts.find { it.contains(":") } ?: ""
            return timePart.take(5)
        }
        return dateStr
    }

    /**
     * Formata data e hora com segundos: "18:45:32 (24/10/2026)"
     */
    fun formatDetailedTimestamp(dateStr: String?): String {
        if (dateStr.isNullOrBlank()) return ""
        val date = parseFlexible(dateStr)
        if (date != null) {
            val time = SimpleDateFormat("HH:mm:ss", Locale.getDefault()).format(date)
            val d = SimpleDateFormat("dd/MM/yyyy", Locale.getDefault()).format(date)
            return "$time ($d)"
        }
        return dateStr
    }

    private fun parseFlexible(raw: String): Date? {
        val trimmed = raw.trim()
        val patterns = listOf(
            "yyyy-MM-dd'T'HH:mm:ss.SSS'Z'",
            "yyyy-MM-dd'T'HH:mm:ss'Z'",
            "yyyy-MM-dd'T'HH:mm:ss",
            "yyyy-MM-dd HH:mm:ss",
            "dd/MM/yyyy HH:mm:ss",
            "dd/MM/yyyy HH:mm",
            "yyyy-MM-dd"
        )
        for (pattern in patterns) {
            try {
                val sdf = SimpleDateFormat(pattern, Locale.getDefault())
                if (pattern.endsWith("'Z'")) {
                    sdf.timeZone = TimeZone.getTimeZone("UTC")
                }
                val d = sdf.parse(trimmed)
                if (d != null) return d
            } catch (_: Exception) {}
        }
        return null
    }
}
