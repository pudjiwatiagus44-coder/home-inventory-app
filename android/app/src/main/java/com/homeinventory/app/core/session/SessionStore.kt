package com.homeinventory.app.core.session

interface SessionStore {
    fun saveSessionCookie(setCookieHeader: String)
    fun sessionCookie(): String?
    fun saveUserId(userId: String)
    fun userId(): String?
    fun clear()
}

class InMemorySessionStore : SessionStore {
    private var cookie: String? = null
    private var userId: String? = null

    override fun saveSessionCookie(setCookieHeader: String) {
        cookie = CookieHeaderParser.parse(setCookieHeader)
    }

    override fun sessionCookie(): String? = cookie

    override fun saveUserId(userId: String) {
        this.userId = userId
    }

    override fun userId(): String? = userId

    override fun clear() {
        cookie = null
        userId = null
    }

    fun rawPasswordForTest(): String? = null
}
