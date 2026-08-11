package com.homeinventory.app.data.repository

import com.homeinventory.app.core.network.HomeInventoryApi
import com.homeinventory.app.core.network.LoginRequest
import com.homeinventory.app.core.network.RegisterRequest
import com.homeinventory.app.core.network.ForgotPasswordRequest
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
import okhttp3.Headers
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.ResponseBody.Companion.toResponseBody
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

    @Test
    fun registerSavesSessionCookieOnSuccess() = runTest {
        val sessionStore = InMemorySessionStore()
        val repository = AuthRepository(
            api = object : TestApiStub() {
                override suspend fun register(request: RegisterRequest): Response<AuthResponse> =
                    Response.success(
                        AuthResponse(ok = true, userId = "user-1"),
                        Headers.headersOf(
                            "set-cookie",
                            "home_inventory_session=abc; Path=/; HttpOnly",
                        ),
                    )
            },
            sessionStore = sessionStore,
        )

        val result = repository.register("user@example.com", "password123")

        assertTrue(result.isSuccess)
        assertEquals("home_inventory_session=abc", sessionStore.sessionCookie())
        assertEquals("user-1", sessionStore.userId())
    }

    @Test
    fun registerReturnsServerFailureMessage() = runTest {
        val repository = AuthRepository(
            api = object : TestApiStub() {
                override suspend fun register(request: RegisterRequest): Response<AuthResponse> =
                    Response.error(
                        409,
                        "{\"ok\":false,\"message\":\"Email is already registered\"}"
                            .toResponseBody("application/json".toMediaType()),
                    )
            },
            sessionStore = InMemorySessionStore(),
        )

        val result = repository.register("user@example.com", "password123")

        assertTrue(result.isFailure)
        assertEquals("Email is already registered", result.exceptionOrNull()?.message)
    }

    @Test
    fun registerNetworkFailureReturnsConnectionMessage() = runTest {
        val repository = AuthRepository(
            api = object : TestApiStub() {
                override suspend fun register(request: RegisterRequest): Response<AuthResponse> {
                    throw IOException("timeout")
                }
            },
            sessionStore = InMemorySessionStore(),
        )

        val result = repository.register("user@example.com", "password123")

        assertTrue(result.isFailure)
        assertEquals("无法连接服务器，请检查网络或服务器地址", result.exceptionOrNull()?.message)
    }

    @Test
    fun forgotPasswordReturnsSuccessForUnknownEmail() = runTest {
        val repository = AuthRepository(
            api = object : TestApiStub() {},
            sessionStore = InMemorySessionStore(),
        )

        val result = repository.forgotPassword("missing@example.com")

        assertTrue(result.isSuccess)
    }

    @Test
    fun forgotPasswordReturnsServerFailureMessage() = runTest {
        val repository = AuthRepository(
            api = object : TestApiStub() {
                override suspend fun forgotPassword(request: ForgotPasswordRequest): Response<ApiEnvelope<Unit>> =
                    Response.error(
                        429,
                        "{\"ok\":false,\"message\":\"请求过于频繁，请稍后再试\"}"
                            .toResponseBody("application/json".toMediaType()),
                    )
            },
            sessionStore = InMemorySessionStore(),
        )

        val result = repository.forgotPassword("user@example.com")

        assertTrue(result.isFailure)
        assertEquals("请求过于频繁，请稍后再试", result.exceptionOrNull()?.message)
    }
}

private class FailingLoginApi(
    private val error: Throwable,
) : TestApiStub() {
    override suspend fun login(request: LoginRequest): Response<AuthResponse> {
        throw error
    }
}
