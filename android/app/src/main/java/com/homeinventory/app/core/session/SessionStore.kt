package com.homeinventory.app.core.session

import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow

interface SessionStore {
    val sessionCookieFlow: StateFlow<String?>
    val sessionExpiredFlow: StateFlow<Boolean>

    fun saveSessionCookie(setCookieHeader: String)
    fun sessionCookie(): String?
    fun clear()
    fun invalidateSession()
}

class InMemorySessionStore : SessionStore {
    private val mutableSessionCookie = MutableStateFlow<String?>(null)
    private val mutableSessionExpired = MutableStateFlow(false)

    override val sessionCookieFlow: StateFlow<String?> = mutableSessionCookie
    override val sessionExpiredFlow: StateFlow<Boolean> = mutableSessionExpired

    override fun saveSessionCookie(setCookieHeader: String) {
        val cookie = CookieHeaderParser.parse(setCookieHeader) ?: return
        mutableSessionCookie.value = cookie
        mutableSessionExpired.value = false
    }

    override fun sessionCookie(): String? = mutableSessionCookie.value

    override fun clear() {
        mutableSessionCookie.value = null
        mutableSessionExpired.value = false
    }

    override fun invalidateSession() {
        mutableSessionCookie.value = null
        mutableSessionExpired.value = true
    }

    fun rawPasswordForTest(): String? = null
}
