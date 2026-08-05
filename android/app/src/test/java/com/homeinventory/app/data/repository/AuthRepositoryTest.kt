package com.homeinventory.app.data.repository

import com.homeinventory.app.core.network.HomeInventoryApi
import com.homeinventory.app.core.network.LoginRequest
import com.homeinventory.app.core.session.InMemorySessionStore
import com.homeinventory.app.data.remote.ApiEnvelope
import com.homeinventory.app.data.remote.AuthResponse
import com.homeinventory.app.data.remote.MobileSyncRequest
import com.homeinventory.app.data.remote.MobileSyncResponse
import com.homeinventory.app.data.remote.RemoteDashboardDto
import java.io.IOException
import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import retrofit2.Response

class AuthRepositoryTest {
    @Test
    fun returnsFailureWhenLoginNetworkRequestFails() = runTest {
        val sessionStore = InMemorySessionStore()
        val repository = AuthRepository(
            api = FailingLoginApi(IOException("timeout")),
            sessionStore = sessionStore,
        )

        val result = repository.login("user@example.com", "password")

        assertTrue(result.isFailure)
        assertEquals("无法连接服务器，请检查网络或服务器地址", result.exceptionOrNull()?.message)
        assertNull(sessionStore.sessionCookie())
    }
}

private class FailingLoginApi(
    private val error: Throwable,
) : TestApiStub() {
    override suspend fun login(request: LoginRequest): Response<AuthResponse> {
        throw error
    }
}
