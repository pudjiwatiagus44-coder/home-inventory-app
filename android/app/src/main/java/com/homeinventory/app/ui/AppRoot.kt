package com.homeinventory.app.ui

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import com.homeinventory.app.HomeInventoryApplication
import com.homeinventory.app.core.config.AppConfig
import com.homeinventory.app.core.network.NetworkModule
import com.homeinventory.app.data.repository.AuthRepository
import com.homeinventory.app.data.repository.InventoryRepository
import com.homeinventory.app.data.sync.AndroidConnectivityObserver
import com.homeinventory.app.data.sync.DaoPendingOperationQueue
import com.homeinventory.app.data.sync.RetrofitRemoteSyncClient
import com.homeinventory.app.data.sync.SyncEngine
import com.homeinventory.app.ui.login.LoginScreen
import kotlinx.coroutines.launch

@Composable
fun AppRoot() {
    val scope = rememberCoroutineScope()
    val app = LocalContext.current.applicationContext as HomeInventoryApplication
    val sessionStore = app.sessionStore
    val api = remember { NetworkModule.createApi(sessionStore) }
    val authRepository = remember {
        AuthRepository(
            api = api,
            sessionStore = sessionStore,
        )
    }
    val inventoryRepository = remember {
        InventoryRepository(
            api = api,
            areaDao = app.database.areaDao(),
            locationDao = app.database.locationDao(),
            itemDao = app.database.itemDao(),
            pendingOperationDao = app.database.pendingOperationDao(),
            syncStateDao = app.database.syncStateDao(),
        )
    }
    var isLoggedIn by remember { mutableStateOf(sessionStore.sessionCookie() != null) }
    var email by remember { mutableStateOf("") }
    var password by remember { mutableStateOf("") }
    var isLoading by remember { mutableStateOf(false) }
    var errorMessage by remember { mutableStateOf<String?>(null) }

    MaterialTheme {
        if (isLoggedIn) {
            Column(
                modifier = Modifier.fillMaxSize(),
                horizontalAlignment = Alignment.CenterHorizontally,
                verticalArrangement = Arrangement.Center,
            ) {
                CircularProgressIndicator()
                Text(text = "正在同步清单...")
            }
            LaunchedEffect(Unit) {
                if (isLoggedIn) {
                    scope.launch { inventoryRepository.refreshSnapshot() }
                    scope.launch {
                        SyncEngine(
                            queue = DaoPendingOperationQueue(app.database.pendingOperationDao()),
                            remote = RetrofitRemoteSyncClient(api),
                            onOperationApplied = { applied ->
                                when (applied.entity) {
                                    "area" -> app.database.areaDao().markSynced(
                                        applied.localId.orEmpty(),
                                        applied.serverId,
                                        applied.serverUpdatedAt.orEmpty(),
                                    )
                                    "location" -> app.database.locationDao().markSynced(
                                        applied.localId.orEmpty(),
                                        applied.serverId,
                                        applied.serverUpdatedAt.orEmpty(),
                                    )
                                    "item" -> app.database.itemDao().markSynced(
                                        applied.localId.orEmpty(),
                                        applied.serverId,
                                        applied.serverUpdatedAt.orEmpty(),
                                    )
                                }
                            },
                        ).syncWhenOnline(AndroidConnectivityObserver(app))
                    }
                }
            }
        } else {
            LoginScreen(
                email = email,
                password = password,
                serverUrl = AppConfig.baseUrl,
                isLoading = isLoading,
                errorMessage = errorMessage,
                onEmailChange = {
                    email = it
                    errorMessage = null
                },
                onPasswordChange = {
                    password = it
                    errorMessage = null
                },
                onLogin = {
                    isLoading = true
                    errorMessage = null
                    scope.launch {
                        authRepository.login(email, password)
                            .onSuccess {
                                password = ""
                                isLoggedIn = true
                                scope.launch { inventoryRepository.refreshSnapshot() }
                            }
                            .onFailure { error ->
                                errorMessage = error.message ?: "登录失败"
                            }
                        isLoading = false
                    }
                },
            )
        }
    }
}
