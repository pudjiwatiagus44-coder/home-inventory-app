package com.homeinventory.app.core.session

import android.content.Context
import android.content.SharedPreferences

interface FirstRunStore {
    fun markPending()
    fun markCompleted()
    fun shouldShow(): Boolean
    fun clear()
}

class SharedPreferencesFirstRunStore(context: Context) : FirstRunStore {
    private val preferences: SharedPreferences =
        context.getSharedPreferences("home_inventory_first_run_store", Context.MODE_PRIVATE)

    override fun markPending() {
        preferences.edit()
            .putBoolean(KEY_PENDING, true)
            .putBoolean(KEY_COMPLETED, false)
            .apply()
    }

    override fun markCompleted() {
        preferences.edit()
            .putBoolean(KEY_PENDING, false)
            .putBoolean(KEY_COMPLETED, true)
            .apply()
    }

    override fun shouldShow(): Boolean =
        preferences.getBoolean(KEY_PENDING, false) &&
            !preferences.getBoolean(KEY_COMPLETED, false)

    override fun clear() {
        preferences.edit().remove(KEY_PENDING).remove(KEY_COMPLETED).apply()
    }

    private companion object {
        const val KEY_PENDING = "pending"
        const val KEY_COMPLETED = "completed"
    }
}
