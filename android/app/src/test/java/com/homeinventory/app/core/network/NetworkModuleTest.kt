package com.homeinventory.app.core.network

import com.homeinventory.app.core.session.InMemorySessionStore
import okhttp3.Call
import okhttp3.Connection
import okhttp3.Interceptor
import okhttp3.Protocol
import okhttp3.Request
import okhttp3.Response
import okhttp3.ResponseBody.Companion.toResponseBody
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import java.util.concurrent.TimeUnit

class NetworkModuleTest {
    @Test
    fun addsSavedSessionCookieToRequest() {
        val store = InMemorySessionStore().apply {
            saveSessionCookie("home_inventory_session=abc; Path=/; HttpOnly")
        }
        val chain = RecordingChain(responseCode = 200)

        SessionCookieInterceptor(store).intercept(chain)

        assertEquals("home_inventory_session=abc", chain.proceededRequest?.header("Cookie"))
    }

    @Test
    fun invalidatesSessionWhenAuthenticatedRequestReceives401() {
        val store = InMemorySessionStore().apply {
            saveSessionCookie("home_inventory_session=abc; Path=/; HttpOnly")
        }
        val chain = RecordingChain(responseCode = 401)

        SessionCookieInterceptor(store).intercept(chain)

        assertNull(store.sessionCookieFlow.value)
        assertTrue(store.sessionExpiredFlow.value)
        assertEquals(1, chain.proceedCount)
    }

    @Test
    fun doesNotInvalidateSessionWhenAuthenticatedRequestReceives403() {
        val store = InMemorySessionStore().apply {
            saveSessionCookie("home_inventory_session=abc; Path=/; HttpOnly")
        }

        SessionCookieInterceptor(store).intercept(RecordingChain(responseCode = 403))

        assertEquals("home_inventory_session=abc", store.sessionCookieFlow.value)
        assertFalse(store.sessionExpiredFlow.value)
    }

    @Test
    fun anonymous401DoesNotMarkSessionExpired() {
        val store = InMemorySessionStore()
        val chain = RecordingChain(responseCode = 401)

        SessionCookieInterceptor(store).intercept(chain)

        assertNull(chain.proceededRequest?.header("Cookie"))
        assertNull(store.sessionCookieFlow.value)
        assertFalse(store.sessionExpiredFlow.value)
    }

    private class RecordingChain(
        private val responseCode: Int,
    ) : Interceptor.Chain {
        private val originalRequest = Request.Builder()
            .url("https://example.test/api/protected")
            .build()

        var proceededRequest: Request? = null
        var proceedCount: Int = 0

        override fun request(): Request = originalRequest

        override fun proceed(request: Request): Response {
            proceededRequest = request
            proceedCount += 1
            return Response.Builder()
                .request(request)
                .protocol(Protocol.HTTP_1_1)
                .code(responseCode)
                .message("test")
                .body("".toResponseBody())
                .build()
        }

        override fun connection(): Connection? = null
        override fun call(): Call = throw UnsupportedOperationException("not needed")
        override fun connectTimeoutMillis(): Int = 0
        override fun withConnectTimeout(timeout: Int, unit: TimeUnit): Interceptor.Chain = this
        override fun readTimeoutMillis(): Int = 0
        override fun withReadTimeout(timeout: Int, unit: TimeUnit): Interceptor.Chain = this
        override fun writeTimeoutMillis(): Int = 0
        override fun withWriteTimeout(timeout: Int, unit: TimeUnit): Interceptor.Chain = this
    }
}
