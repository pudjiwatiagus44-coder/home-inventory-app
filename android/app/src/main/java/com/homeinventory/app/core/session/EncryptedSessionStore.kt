package com.homeinventory.app.core.session

import android.content.Context
import android.content.SharedPreferences
import androidx.security.crypto.EncryptedSharedPreferences
import androidx.security.crypto.MasterKey
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow

class EncryptedSessionStore(context: Context) : SessionStore {
    private val lock = Any()
    private val preferences: SharedPreferences = run {
        val masterKey = MasterKey.Builder(context)
            .setKeyScheme(MasterKey.KeyScheme.AES256_GCM)
            .build()
        EncryptedSharedPreferences.create(
            context,
            "home_inventory_session_store",
            masterKey,
            EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,
            EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM,
        )
    }
    private val mutableSessionCookie = MutableStateFlow(
        preferences.getString(KEY_SESSION_COOKIE, null),
    )
    private val mutableSessionExpired = MutableStateFlow(false)

    override val sessionCookieFlow: StateFlow<String?> = mutableSessionCookie
    override val sessionExpiredFlow: StateFlow<Boolean> = mutableSessionExpired

    override fun saveSessionCookie(setCookieHeader: String) = synchronized(lock) {
        val cookie = CookieHeaderParser.parse(setCookieHeader) ?: return
        preferences.edit().putString(KEY_SESSION_COOKIE, cookie).apply()
        mutableSessionCookie.value = cookie
        mutableSessionExpired.value = false
    }

    override fun sessionCookie(): String? = synchronized(lock) {
        mutableSessionCookie.value
    }

    override fun clear() = synchronized(lock) {
        preferences.edit().remove(KEY_SESSION_COOKIE).apply()
        mutableSessionCookie.value = null
        mutableSessionExpired.value = false
    }

    override fun invalidateSession(expectedCookie: String): Boolean = synchronized(lock) {
        if (mutableSessionCookie.value != expectedCookie) return false
        preferences.edit().remove(KEY_SESSION_COOKIE).apply()
        mutableSessionCookie.value = null
        mutableSessionExpired.value = true
        true
    }

    private companion object {
        const val KEY_SESSION_COOKIE = "home_inventory_session"
    }
}
