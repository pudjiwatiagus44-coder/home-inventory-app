package com.homeinventory.app.core.session

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class CookieHeaderParserTest {
    @Test
    fun extractsHomeInventorySessionFromSetCookieHeader() {
        val cookie = CookieHeaderParser.parse(
            "home_inventory_session=abc123; Path=/; HttpOnly",
        )
        assertEquals("home_inventory_session=abc123", cookie)
    }

    @Test
    fun returnsNullWhenHeaderHasNoSessionCookie() {
        assertNull(CookieHeaderParser.parse("other=value; Path=/"))
    }

    @Test
    fun returnsNullWhenHeaderIsBlank() {
        assertNull(CookieHeaderParser.parse(""))
        assertNull(CookieHeaderParser.parse(null))
    }
}
