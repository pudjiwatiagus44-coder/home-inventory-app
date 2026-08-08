package com.homeinventory.app.core.session

import android.content.Context
import android.content.SharedPreferences
import androidx.security.crypto.EncryptedSharedPreferences
import androidx.security.crypto.MasterKey

interface RememberedEmailStore {
    fun load(): String?
    fun save(email: String)
    fun clear()
}

class EncryptedRememberedEmailStore(context: Context) : RememberedEmailStore {
    private val preferences: SharedPreferences = run {
        val masterKey = MasterKey.Builder(context)
            .setKeyScheme(MasterKey.KeyScheme.AES256_GCM)
            .build()
        EncryptedSharedPreferences.create(
            context,
            "home_inventory_remembered_email_store",
            masterKey,
            EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,
            EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM,
        )
    }

    override fun load(): String? =
        preferences.getString(KEY_REMEMBERED_EMAIL, null)

    override fun save(email: String) {
        preferences.edit().putString(KEY_REMEMBERED_EMAIL, email).apply()
    }

    override fun clear() {
        preferences.edit().remove(KEY_REMEMBERED_EMAIL).apply()
    }

    private companion object {
        const val KEY_REMEMBERED_EMAIL = "remembered_email"
    }
}
