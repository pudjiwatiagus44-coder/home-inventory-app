package com.homeinventory.app.core.session

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class SessionStoreTest {
    @Test
    fun storesCookieWithoutStoringPassword() {
        val store = InMemorySessionStore()

        store.saveSessionCookie("home_inventory_session=abc; Path=/; HttpOnly")

        assertEquals("home_inventory_session=abc", store.sessionCookie())
        assertNull(store.rawPasswordForTest())
    }

    @Test
    fun ignoresHeadersWithoutSessionCookie() {
        val store = InMemorySessionStore()

        store.saveSessionCookie("other=value; Path=/")

        assertNull(store.sessionCookie())
    }

    @Test
    fun storesUserIdForHouseholdPreferenceScoping() {
        val store = InMemorySessionStore()

        store.saveUserId("user-1")

        assertEquals("user-1", store.userId())
    }
}
