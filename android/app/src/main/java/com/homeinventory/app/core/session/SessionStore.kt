package com.homeinventory.app.core.session

interface SessionStore {
    fun saveSessionCookie(setCookieHeader: String)
    fun sessionCookie(): String?
    fun clear()
}

class InMemorySessionStore : SessionStore {
    private var cookie: String? = null

    override fun saveSessionCookie(setCookieHeader: String) {
        cookie = setCookieHeader.substringBefore(";").trim().ifEmpty { null }
    }

    override fun sessionCookie(): String? = cookie

    override fun clear() {
        cookie = null
    }

    fun rawPasswordForTest(): String? = null
}
