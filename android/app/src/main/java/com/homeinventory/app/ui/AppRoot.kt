package com.homeinventory.app.ui

import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.platform.LocalContext
import androidx.lifecycle.viewmodel.compose.viewModel
import androidx.lifecycle.viewmodel.initializer
import androidx.lifecycle.viewmodel.viewModelFactory
import com.homeinventory.app.HomeInventoryApplication
import com.homeinventory.app.BuildConfig
import com.homeinventory.app.core.config.AppConfig
import com.homeinventory.app.core.network.NetworkModule
import com.homeinventory.app.data.media.LocalPhotoStore
import com.homeinventory.app.data.repository.DraftRepository
import com.homeinventory.app.data.repository.AuthRepository
import com.homeinventory.app.data.repository.ImportExportRepository
import com.homeinventory.app.data.repository.InventoryRepository
import com.homeinventory.app.data.sync.AndroidConnectivityObserver
import com.homeinventory.app.data.sync.DaoPendingOperationQueue
import com.homeinventory.app.data.sync.RetrofitRemoteSyncClient
import com.homeinventory.app.data.sync.SyncEngine
import com.homeinventory.app.ui.dashboard.DashboardHost
import com.homeinventory.app.ui.dashboard.DashboardViewModel
import com.homeinventory.app.ui.login.LoginScreen
import com.homeinventory.app.ui.theme.HomeInventoryTheme
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
    val importExportRepository = remember {
        ImportExportRepository(api = api)
    }
    val repository = remember {
        InventoryRepository(
            api = api,
            areaDao = app.database.areaDao(),
            locationDao = app.database.locationDao(),
            itemDao = app.database.itemDao(),
            pendingOperationDao = app.database.pendingOperationDao(),
            syncStateDao = app.database.syncStateDao(),
        )
    }
    val draftRepository = remember {
        DraftRepository(
            draftDao = app.database.draftDao(),
            api = api,
            savePhoto = { fileName, bytes ->
                LocalPhotoStore.save(app.applicationContext, fileName, bytes)
            },
            readPhotoFile = { fileName ->
                LocalPhotoStore.read(app.applicationContext, fileName, 256)
            },
            readPhotoFileLarge = { fileName ->
                LocalPhotoStore.read(app.applicationContext, fileName, 1600)
            },
            readPhotoBytes = { fileName ->
                LocalPhotoStore.readBytes(app.applicationContext, fileName)
            },
            deletePhotoFile = { fileName ->
                LocalPhotoStore.delete(app.applicationContext, fileName)
            },
        )
    }
    val factory = remember(repository) {
        viewModelFactory {
            initializer {
                DashboardViewModel(
                    inventory = repository.observeInventory(),
                    syncPending = repository::syncPendingOperations,
                    createInvitation = repository::createInvitationLink,
                    loadJoinRequests = repository::listJoinRequests,
                    approveJoinRequest = repository::approveJoinRequest,
                    rejectJoinRequest = repository::rejectJoinRequest,
                    listFamilyMembers = repository::listFamilyMembers,
                    removeFamilyMember = repository::removeFamilyMember,
                    updateMemberRole = repository::updateMemberRole,
                    checkForUpdate = repository::checkForUpdate,
                    recognizePhoto = repository::recognizeItemPhoto,
                    loadPhoto = repository::loadItemPhoto,
                    draftGateway = draftRepository,
                    confirmDraftCreate = repository::createItemOnline,
                    localVersionCode = BuildConfig.VERSION_CODE,
                )
            }
        }
    }
    val viewModel: DashboardViewModel = viewModel(factory = factory)
    var isLoggedIn by remember { mutableStateOf(sessionStore.sessionCookie() != null) }
    var email by remember { mutableStateOf("") }
    var password by remember { mutableStateOf("") }
    var isLoading by remember { mutableStateOf(false) }
    var errorMessage by remember { mutableStateOf<String?>(null) }

    LaunchedEffect(isLoggedIn) {
        if (isLoggedIn) {
            scope.launch { repository.refreshSnapshot() }
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

    HomeInventoryTheme {
        if (isLoggedIn) {
            DashboardHost(
                viewModel = viewModel,
                repository = repository,
                authRepository = authRepository,
                database = app.database,
                importExportRepository = importExportRepository,
                onSignedOut = { isLoggedIn = false },
            )
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
                                scope.launch { repository.refreshSnapshot() }
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
