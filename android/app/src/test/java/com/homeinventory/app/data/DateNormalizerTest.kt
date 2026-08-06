package com.homeinventory.app.data

import java.time.ZoneOffset
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class DateNormalizerTest {
    @Test
    fun keepsPlainDateAsIs() {
        assertEquals("2026-08-05", DateNormalizer.normalizeExpireDate("2026-08-05"))
    }

    @Test
    fun convertsUtcTimestampToLocalDate() {
        // 2026-08-04T16:00:00Z = 2026-08-05 in UTC+8
        assertEquals(
            "2026-08-05",
            DateNormalizer.normalizeExpireDate(
                "2026-08-04T16:00:00.000Z",
                zoneId = ZoneOffset.ofHours(8),
            ),
        )
    }

    @Test
    fun returnsNullWhenBlank() {
        assertNull(DateNormalizer.normalizeExpireDate(null))
        assertNull(DateNormalizer.normalizeExpireDate(""))
    }
}
