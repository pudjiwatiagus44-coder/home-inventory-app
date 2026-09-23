package com.homeinventory.app.ui.dashboard

import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertEquals
import org.junit.Test

class ManualLogoutTest {
    @Test
    fun clearsAccountDataBeforeLoggingOutAndNotifyingUi() = runTest {
        val events = mutableListOf<String>()

        performManualLogout(
            clearAccountData = { events += "clear-data" },
            logout = {
                events += "logout"
                Result.success(Unit)
            },
            onSignedOut = { events += "signed-out" },
        )

        assertEquals(listOf("clear-data", "logout", "signed-out"), events)
    }
}
