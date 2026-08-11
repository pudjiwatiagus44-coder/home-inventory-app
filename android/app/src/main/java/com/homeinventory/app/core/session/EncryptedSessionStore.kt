package com.homeinventory.app.core.session

import android.content.Context
import android.content.SharedPreferences
import androidx.security.crypto.EncryptedSharedPreferences
import androidx.security.crypto.MasterKey

class EncryptedSessionStore(context: Context) : SessionStore {
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

    override fun saveSessionCookie(setCookieHeader: String) {
        val cookie = CookieHeaderParser.parse(setCookieHeader) ?: return
        preferences.edit().putString(KEY_SESSION_COOKIE, cookie).apply()
    }

    override fun sessionCookie(): String? =
        preferences.getString(KEY_SESSION_COOKIE, null)

    override fun saveUserId(userId: String) {
        preferences.edit().putString(KEY_USER_ID, userId).apply()
    }

    override fun userId(): String? =
        preferences.getString(KEY_USER_ID, null)

    override fun clear() {
        preferences.edit()
            .remove(KEY_SESSION_COOKIE)
            .remove(KEY_USER_ID)
            .apply()
    }

    private companion object {
        const val KEY_SESSION_COOKIE = "home_inventory_session"
        const val KEY_USER_ID = "home_inventory_user_id"
    }
}
