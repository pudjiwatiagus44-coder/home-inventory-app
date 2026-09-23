package com.homeinventory.app.ui

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class AppRootTest {
    @Test
    fun expiredSessionShowsReloginMessage() {
        assertEquals("登录已失效，请重新登录", sessionErrorMessage(sessionExpired = true))
    }

    @Test
    fun manualLogoutDoesNotShowExpiredSessionMessage() {
        assertNull(sessionErrorMessage(sessionExpired = false))
    }
}
