package com.homeinventory.app.core.session

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class SessionStoreTest {
    @Test
    fun storesCookieWithoutStoringPassword() {
        val store = InMemorySessionStore()

        store.saveSessionCookie("home_inventory_session=abc; Path=/; HttpOnly")

        assertEquals("home_inventory_session=abc", store.sessionCookie())
        assertEquals("home_inventory_session=abc", store.sessionCookieFlow.value)
        assertFalse(store.sessionExpiredFlow.value)
        assertNull(store.rawPasswordForTest())
    }

    @Test
    fun ignoresHeadersWithoutSessionCookie() {
        val store = InMemorySessionStore()

        store.saveSessionCookie("other=value; Path=/")

        assertNull(store.sessionCookie())
    }

    @Test
    fun saveAfterInvalidationRestoresAnActiveSession() {
        val store = InMemorySessionStore()
        store.invalidateSession()

        store.saveSessionCookie("home_inventory_session=new; Path=/; HttpOnly")

        assertEquals("home_inventory_session=new", store.sessionCookieFlow.value)
        assertFalse(store.sessionExpiredFlow.value)
    }

    @Test
    fun clearRemovesCookieWithoutMarkingSessionExpired() {
        val store = InMemorySessionStore()
        store.saveSessionCookie("home_inventory_session=abc; Path=/; HttpOnly")

        store.clear()

        assertNull(store.sessionCookieFlow.value)
        assertFalse(store.sessionExpiredFlow.value)
    }

    @Test
    fun invalidateRemovesCookieAndMarksSessionExpired() {
        val store = InMemorySessionStore()
        store.saveSessionCookie("home_inventory_session=abc; Path=/; HttpOnly")

        store.invalidateSession()

        assertNull(store.sessionCookieFlow.value)
        assertTrue(store.sessionExpiredFlow.value)
    }
}
