package com.homeinventory.app.data.recognition

import android.content.Context
import com.homeinventory.app.core.session.SessionStore
import java.security.MessageDigest

class AndroidRecognitionSettings(context: Context, private val sessions: SessionStore) {
    private val prefs = context.getSharedPreferences("recognition_settings", Context.MODE_PRIVATE)
    private fun sessionId(): String? = sessions.sessionCookie()?.let { cookie ->
        MessageDigest.getInstance("SHA-256").digest(cookie.toByteArray()).joinToString("") { "%02x".format(it) }
    }
    fun bindAccount(userId: String?) {
        val session = sessionId() ?: return
        prefs.edit().putString("account:$session", userId ?: "session:$session").apply()
    }
    val settings = RecognitionSettings(
        accountId = { sessionId()?.let { prefs.getString("account:$it", "session:$it") } },
        read = { prefs.getString(it, null) },
        write = { key, value -> prefs.edit().apply { if (value == null) remove(key) else putString(key, value) }.apply() },
    )
}
