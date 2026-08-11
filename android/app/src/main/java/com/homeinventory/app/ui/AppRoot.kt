package com.homeinventory.app.ui

import android.content.Intent
import android.net.Uri
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.ui.platform.LocalContext
import androidx.lifecycle.viewmodel.compose.viewModel
import androidx.lifecycle.viewmodel.initializer
import androidx.lifecycle.viewmodel.viewModelFactory
import com.homeinventory.app.HomeInventoryApplication
import com.homeinventory.app.BuildConfig
import com.homeinventory.app.core.config.AppConfig
import com.homeinventory.app.core.network.NetworkModule
import com.homeinventory.app.core.session.EncryptedRememberedEmailStore
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
                    loadHouseholds = repository::loadHouseholds,
                    switchHousehold = repository::switchHousehold,
                    selectedHouseholdId = repository::selectedHouseholdId,
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
    val updateState by viewModel.updateCheckState().collectAsState()
    var isLoggedIn by remember { mutableStateOf(sessionStore.sessionCookie() != null) }
    var email by remember { mutableStateOf("") }
    var password by remember { mutableStateOf("") }
    var isLoading by remember { mutableStateOf(false) }
    var errorMessage by remember { mutableStateOf<String?>(null) }
    val rememberEmailStore = remember { EncryptedRememberedEmailStore(app) }
    var rememberEmail by remember { mutableStateOf(true) }
    var forgotPasswordNotice by remember { mutableStateOf<String?>(null) }

    LaunchedEffect(Unit) {
        val savedEmail = rememberEmailStore.load()

        if (!savedEmail.isNullOrBlank()) {
            email = savedEmail
        }
    }

    fun persistRememberedEmail() {
        if (rememberEmail) {
            rememberEmailStore.save(email.trim().lowercase())
        } else {
            rememberEmailStore.clear()
        }
    }

    LaunchedEffect(isLoggedIn) {
        viewModel.checkForUpdates()

        if (isLoggedIn) {
            scope.launch {
                repository.loadHouseholds()
                repository.refreshSnapshot()
                viewModel.refreshHouseholds()
            }
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
                rememberEmail = rememberEmail,
                onRememberEmailChange = { rememberEmail = it },
                forgotPasswordNotice = forgotPasswordNotice,
                onClearForgotPasswordNotice = { forgotPasswordNotice = null },
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
                                persistRememberedEmail()
                                isLoggedIn = true
                                app.firstRunStore.markPending()
                                scope.launch {
                                    repository.loadHouseholds()
                                    repository.refreshSnapshot()
                                    viewModel.refreshHouseholds()
                                }
                            }
                            .onFailure { error ->
                                errorMessage = error.message ?: "登录失败"
                            }
                        isLoading = false
                    }
                },
                onRegister = {
                    isLoading = true
                    errorMessage = null
                    scope.launch {
                        authRepository.register(email, password)
                            .onSuccess {
                                password = ""
                                persistRememberedEmail()
                                isLoggedIn = true
                                scope.launch {
                                    repository.loadHouseholds()
                                    repository.refreshSnapshot()
                                    viewModel.refreshHouseholds()
                                }
                            }
                            .onFailure { error ->
                                errorMessage = error.message ?: "注册失败"
                            }
                        isLoading = false
                    }
                },
                onForgotPassword = { forgotEmail ->
                    scope.launch {
                        authRepository.forgotPassword(forgotEmail)
                            .onSuccess {
                                forgotPasswordNotice = "若邮箱已注册，重置链接已发送"
                            }
                            .onFailure { error ->
                                forgotPasswordNotice =
                                    error.message ?: "请求失败，请稍后再试"
                            }
                    }
                },
            )
        }

        if (updateState.updateAvailable) {
            val context = LocalContext.current
            AlertDialog(
                onDismissRequest = viewModel::dismissUpdatePrompt,
                title = { Text("发现新版本") },
                text = {
                    Text(
                        updateState.versionName?.let { "有新版本 v$it 可更新，是否立即下载？" }
                            ?: "有新版本可更新，是否立即下载？",
                    )
                },
                confirmButton = {
                    TextButton(
                        onClick = {
                            updateState.downloadUrl?.let { url ->
                                context.startActivity(
                                    Intent(Intent.ACTION_VIEW, Uri.parse(url)),
                                )
                            }
                            viewModel.dismissUpdatePrompt()
                        },
                    ) {
                        Text("立即更新")
                    }
                },
                dismissButton = {
                    TextButton(onClick = viewModel::dismissUpdatePrompt) {
                        Text("稍后")
                    }
                },
            )
        }
    }
}
