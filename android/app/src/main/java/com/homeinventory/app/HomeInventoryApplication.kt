package com.homeinventory.app

import android.app.Application
import com.homeinventory.app.core.session.EncryptedSessionStore
import com.homeinventory.app.core.session.FirstRunStore
import com.homeinventory.app.core.session.SessionStore
import com.homeinventory.app.core.session.SharedPreferencesFirstRunStore
import com.homeinventory.app.data.local.AppDatabase

class HomeInventoryApplication : Application() {
    val database: AppDatabase by lazy { AppDatabase.getInstance(this) }
    val sessionStore: SessionStore by lazy { EncryptedSessionStore(this) }
    val firstRunStore: FirstRunStore by lazy { SharedPreferencesFirstRunStore(this) }
}
