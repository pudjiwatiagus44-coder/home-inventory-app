package com.homeinventory.app.data

import java.time.Instant
import java.time.ZoneId

object DateNormalizer {
    fun normalizeExpireDate(
        value: String?,
        zoneId: ZoneId = ZoneId.systemDefault(),
    ): String? {
        if (value.isNullOrBlank()) return null
        val trimmed = value.trim()
        if (trimmed.length == 10 && trimmed[4] == '-' && trimmed[7] == '-') {
            return trimmed
        }
        return try {
            Instant.parse(trimmed)
                .atZone(zoneId)
                .toLocalDate()
                .toString()
        } catch (_: Exception) {
            trimmed.take(10)
        }
    }
}
