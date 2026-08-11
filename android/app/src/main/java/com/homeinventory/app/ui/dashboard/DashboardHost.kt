package com.homeinventory.app.ui.dashboard

import android.content.Context
import android.widget.Toast
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.PickVisualMediaRequest
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateMapOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalLifecycleOwner
import androidx.core.content.FileProvider
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleEventObserver
import androidx.compose.material3.Text
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.TextButton
import com.homeinventory.app.data.local.AppDatabase
import com.homeinventory.app.data.excel.BackupRow
import com.homeinventory.app.core.config.AppConfig
import com.homeinventory.app.data.local.DraftEntity
import com.homeinventory.app.data.media.ImageCompressor
import com.homeinventory.app.data.media.LocalPhotoStore
import com.homeinventory.app.data.remote.HouseholdDto
import com.homeinventory.app.data.remote.ImportPreviewDto
import com.homeinventory.app.data.repository.AuthRepository
import com.homeinventory.app.data.repository.ImportExportRepository
import com.homeinventory.app.data.repository.InventoryRepository
import com.homeinventory.app.data.repository.InventorySnapshot
import com.homeinventory.app.data.repository.FeedbackRepository
import java.io.File
import com.homeinventory.app.ui.dashboard.dialogs.AreaFormDialog
import com.homeinventory.app.ui.dashboard.dialogs.AreaFormValues
import com.homeinventory.app.ui.dashboard.dialogs.DraftsDialog
import com.homeinventory.app.ui.dashboard.dialogs.HelpDialog
import com.homeinventory.app.ui.dashboard.dialogs.ItemFormDialog
import com.homeinventory.app.ui.dashboard.dialogs.ItemFormValues
import com.homeinventory.app.ui.dashboard.dialogs.InviteDialog
import com.homeinventory.app.ui.dashboard.dialogs.ImportPreviewDialog
import com.homeinventory.app.ui.dashboard.dialogs.ImportSummaryMessage
import com.homeinventory.app.ui.dashboard.dialogs.LocationFormDialog
import com.homeinventory.app.ui.dashboard.dialogs.LocationFormValues
import com.homeinventory.app.ui.dashboard.dialogs.PhotoPreviewDialog
import com.homeinventory.app.ui.dashboard.dialogs.RenameHouseholdDialog
import com.homeinventory.app.ui.dashboard.dialogs.UNASSIGNED_MARKER
import kotlinx.coroutines.launch

private sealed interface PhotoEntityTarget {
    data class Area(val id: String) : PhotoEntityTarget
    data class Location(val id: String) : PhotoEntityTarget
}

private data class EntityPhotoPreview(
    val entityId: String,
    val photoKey: String?,
)

@Composable
fun DashboardHost(
    viewModel: DashboardViewModel,
    repository: InventoryRepository,
    authRepository: AuthRepository,
    database: AppDatabase,
    importExportRepository: ImportExportRepository,
    feedbackRepository: FeedbackRepository,
    onSignedOut: () -> Unit,
) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    val state by viewModel.state.collectAsState()
    val householdsState by viewModel.householdsState().collectAsState()
    val isHouseholdOwner =
        householdsState.households
            .firstOrNull { it.id == householdsState.currentHouseholdId }
            ?.role == "owner"
    val inviteState by viewModel.invitations().collectAsState()
    val joinRequestsState by viewModel.joinRequestsState().collectAsState()
    val membersUi by viewModel.membersState().collectAsState()
    val draftsUi by viewModel.draftsState.collectAsState()
    val batchState by viewModel.batchImportState().collectAsState()
    var showItemForm by remember { mutableStateOf(false) }
    var previewItem by remember { mutableStateOf<DashboardUiItem?>(null) }
    var showDraftsDialog by remember { mutableStateOf(false) }
    var previewDraft by remember { mutableStateOf<DraftEntity?>(null) }
    var showInviteDialog by remember { mutableStateOf(false) }
    var showHelpDialog by remember { mutableStateOf(false) }
    var householdNameDialog by remember { mutableStateOf<HouseholdNameDialogTarget?>(null) }
    var editingItem by remember { mutableStateOf<DashboardUiItem?>(null) }
    var editingDraftId by remember { mutableStateOf<String?>(null) }
    var locationFormInitialAreaId by remember { mutableStateOf("") }
    var lastItemAreaId by remember { mutableStateOf("") }
    var lastItemLocationId by remember { mutableStateOf("") }
    var showLocationForm by remember { mutableStateOf(false) }
    var showAreaForm by remember { mutableStateOf(false) }
    var editingArea by remember { mutableStateOf<InventorySnapshot.AreaView?>(null) }
    var editingLocation by remember { mutableStateOf<InventorySnapshot.LocationView?>(null) }
    var formError by remember { mutableStateOf<String?>(null) }
    var isSaving by remember { mutableStateOf(false) }
    var importPreview by remember { mutableStateOf<ImportPreviewDto?>(null) }
    var importError by remember { mutableStateOf<String?>(null) }
    var isCommittingImport by remember { mutableStateOf(false) }
    var isRefreshing by remember { mutableStateOf(false) }
    val conflictResolutions = remember { mutableStateMapOf<String, String>() }
    val editingDraft = editingDraftId?.let { id ->
        draftsUi.drafts.firstOrNull { it.id == id }
    }
    val defaultAreaId = editingDraft?.areaId
        ?: editingItem?.areaId
        ?: state.filters.areaId.takeIf { id -> state.areas.any { it.id == id } }
        ?: lastItemAreaId.takeIf { id -> state.areas.any { it.id == id } }
        ?: ""
    val defaultLocationId = editingDraft?.locationId
        ?: editingItem?.locationId
        ?: state.filters.locationId.takeIf { id -> state.locations.any { it.id == id } }
        ?: lastItemLocationId.takeIf { id -> state.locations.any { it.id == id } }
        ?: ""

    val lifecycleOwner = LocalLifecycleOwner.current
    DisposableEffect(lifecycleOwner) {
        val observer = LifecycleEventObserver { _, event ->
            if (event == Lifecycle.Event.ON_RESUME) {
                viewModel.resumePendingRecognitions()
            }
        }
        lifecycleOwner.lifecycle.addObserver(observer)
        onDispose {
            lifecycleOwner.lifecycle.removeObserver(observer)
        }
    }

    LaunchedEffect(batchState.isImporting, batchState.done, batchState.total) {
        if (!batchState.isImporting && batchState.total > 0 && batchState.done >= batchState.total) {
            showItemForm = false
            editingDraftId = null
        }
    }
    var pendingPhotoItem by remember { mutableStateOf<DashboardUiItem?>(null) }
    val itemCameraFile = remember { mutableStateOf<File?>(null) }
    fun processItemPhoto(item: DashboardUiItem, bytes: ByteArray) {
        scope.launch {
            repository.uploadThumbnailOnly(bytes)
                .onSuccess { key ->
                    LocalPhotoStore.save(context, key, bytes)
                    repository.updateItemOnline(
                        item.id,
                        item.name,
                        item.note,
                        item.expireDate,
                        item.locationId,
                        key,
                    )
                }
                .onFailure { error ->
                    Toast.makeText(
                        context,
                        error.message ?: "添加照片失败",
                        Toast.LENGTH_LONG,
                    ).show()
                }
        }
    }
    val itemCameraLauncher = rememberLauncherForActivityResult(
        contract = ActivityResultContracts.TakePicture(),
    ) { success ->
        val item = pendingPhotoItem
        pendingPhotoItem = null
        val file = itemCameraFile.value
        itemCameraFile.value = null
        if (success && item != null && file != null) {
            scope.launch {
                val uri = FileProvider.getUriForFile(
                    context,
                    "${context.packageName}.fileprovider",
                    file,
                )
                val bytes = ImageCompressor.compressToJpeg(context, uri)
                    ?: file.readBytes()
                file.delete()
                processItemPhoto(item, bytes)
            }
        }
    }
    var previewAreaPhoto by remember { mutableStateOf<EntityPhotoPreview?>(null) }
    var previewLocationPhoto by remember { mutableStateOf<EntityPhotoPreview?>(null) }
    var showAreaPhotoPrompt by remember { mutableStateOf(false) }
    var showLocationPhotoPrompt by remember { mutableStateOf(false) }
    var pendingPhotoEntity by remember { mutableStateOf<PhotoEntityTarget?>(null) }
    val entityCameraFile = remember { mutableStateOf<File?>(null) }

    fun uploadEntityPhoto(target: PhotoEntityTarget, bytes: ByteArray) {
        scope.launch {
            val result = when (target) {
                is PhotoEntityTarget.Area -> repository.uploadAreaPhoto(target.id, bytes)
                is PhotoEntityTarget.Location -> repository.uploadLocationPhoto(target.id, bytes)
            }
            result
                .onSuccess { key ->
                    LocalPhotoStore.save(context, key, bytes)
                }
                .onFailure { error ->
                    Toast.makeText(
                        context,
                        error.message ?: "上传照片失败",
                        Toast.LENGTH_LONG,
                    ).show()
                }
            pendingPhotoEntity = null
        }
    }

    val entityCameraLauncher = rememberLauncherForActivityResult(
        contract = ActivityResultContracts.TakePicture(),
    ) { success ->
        val target = pendingPhotoEntity
        val file = entityCameraFile.value
        pendingPhotoEntity = null
        entityCameraFile.value = null
        if (success && target != null && file != null) {
            scope.launch {
                val uri = FileProvider.getUriForFile(
                    context,
                    "${context.packageName}.fileprovider",
                    file,
                )
                val bytes = ImageCompressor.compressToJpeg(context, uri)
                    ?: file.readBytes()
                file.delete()
                uploadEntityPhoto(target, bytes)
            }
        }
    }

    val entityGalleryLauncher = rememberLauncherForActivityResult(
        contract = ActivityResultContracts.PickVisualMedia(),
    ) { uri ->
        val target = pendingPhotoEntity
        pendingPhotoEntity = null
        if (uri != null && target != null) {
            scope.launch {
                val bytes = ImageCompressor.compressToJpeg(context, uri)
                if (bytes == null || bytes.isEmpty()) {
                    Toast.makeText(
                        context,
                        "读取照片失败，请重试",
                        Toast.LENGTH_LONG,
                    ).show()
                } else {
                    uploadEntityPhoto(target, bytes)
                }
            }
        }
    }

    fun launchEntityCamera(target: PhotoEntityTarget) {
        val dir = File(context.cacheDir, "camera").apply { mkdirs() }
        val file = File(dir, "entity_${System.currentTimeMillis()}.jpg")
        entityCameraFile.value = file
        pendingPhotoEntity = target
        entityCameraLauncher.launch(
            FileProvider.getUriForFile(
                context,
                "${context.packageName}.fileprovider",
                file,
            ),
        )
    }

    fun launchEntityGallery(target: PhotoEntityTarget) {
        pendingPhotoEntity = target
        entityGalleryLauncher.launch(
            PickVisualMediaRequest(ActivityResultContracts.PickVisualMedia.ImageOnly),
        )
    }
    val filePicker = rememberLauncherForActivityResult(
        contract = ActivityResultContracts.OpenDocument(),
    ) { uri ->
        if (uri != null) {
            scope.launch {
                val bytes = context.contentResolver.openInputStream(uri)?.use { it.readBytes() }
                if (bytes == null || bytes.isEmpty()) {
                    importError = "读取文件失败"
                } else {
                    importExportRepository.previewImport(bytes, "backup.xlsx")
                        .onSuccess { preview ->
                            conflictResolutions.clear()
                            preview.conflicts.forEach { conflict ->
                                conflictResolutions[conflict.id] = "skip"
                            }
                            importPreview = preview
                            importError = null
                        }
                        .onFailure { error -> importError = error.message }
                }
            }
        }
    }

    DashboardScreen(
        state = state,
        households = householdsState.households,
        currentHouseholdId = householdsState.currentHouseholdId,
        onSwitchHousehold = viewModel::switchToHousehold,
        onSetHouseholdDisplayName = { household ->
            householdNameDialog = HouseholdNameDialogTarget.DisplayName(household)
        },
        onCreateHousehold = {
            householdNameDialog = HouseholdNameDialogTarget.Create
        },
        onSearchChange = viewModel::updateSearch,
        onSelectArea = viewModel::selectArea,
        onSelectLocation = viewModel::selectLocation,
        onSortChange = { mode ->
            when (mode) {
                ItemSortMode.ExpireSoon -> viewModel.sortByExpireSoon()
                ItemSortMode.ExpireLate -> viewModel.sortByExpireLate()
                ItemSortMode.Name -> viewModel.sortByName()
            }
        },
        onAddItem = {
            editingItem = null
            editingDraftId = null
            formError = null
            showItemForm = true
        },
        onAddLocation = {
            editingLocation = null
            locationFormInitialAreaId = state.filters.areaId ?: ""
            formError = null
            showLocationForm = true
        },
        onAddArea = {
            editingArea = null
            formError = null
            showAreaForm = true
        },
        onLongPressArea = { area ->
            editingArea = area
            formError = null
            showAreaForm = true
        },
        onLongPressLocation = { location ->
            editingLocation = location
            formError = null
            showLocationForm = true
        },
        onEditItem = { item ->
            editingItem = item
            editingDraftId = null
            formError = null
            showItemForm = true
        },
        onPhotoClick = { item ->
            previewItem = item
        },
        onAddPhoto = { item ->
            val dir = File(context.cacheDir, "camera").apply { mkdirs() }
            val file = File(dir, "item_${System.currentTimeMillis()}.jpg")
            val uri = FileProvider.getUriForFile(
                context,
                "${context.packageName}.fileprovider",
                file,
            )
            pendingPhotoItem = item
            itemCameraFile.value = file
            itemCameraLauncher.launch(uri)
        },
        onLocationPhotoClick = { item ->
            if (item.locationPhotoKey != null) {
                previewLocationPhoto = EntityPhotoPreview(
                    entityId = item.locationId!!,
                    photoKey = item.locationPhotoKey,
                )
            } else {
                pendingPhotoEntity = PhotoEntityTarget.Location(item.locationId!!)
                showLocationPhotoPrompt = true
            }
        },
        onAreaPhotoClick = { item ->
            if (item.areaPhotoKey != null) {
                previewAreaPhoto = EntityPhotoPreview(
                    entityId = item.areaId!!,
                    photoKey = item.areaPhotoKey,
                )
            } else {
                pendingPhotoEntity = PhotoEntityTarget.Area(item.areaId!!)
                showAreaPhotoPrompt = true
            }
        },
        unassignedFilter = state.unassignedFilter,
        onToggleUnassigned = viewModel::toggleUnassignedFilter,
        loadPhoto = viewModel::itemPhoto,
        onRefresh = {
            scope.launch {
                isRefreshing = true
                repository.syncPendingOperations()
                repository.refreshSnapshot()
                isRefreshing = false
            }
        },
        isRefreshing = isRefreshing,
        onBackup = {
            scope.launch {
                val rows = state.items.mapIndexed { index, item ->
                    BackupRow(
                        index = index + 1,
                        name = item.name,
                        locationName = item.locationName ?: "",
                        areaName = item.areaId
                            ?.let { areaId -> state.areas.firstOrNull { it.id == areaId }?.name }
                            ?: "",
                        note = item.note,
                        expireDate = item.expireDate,
                    )
                }
                importExportRepository.exportBackup(rows = rows, context = context)
                    .onSuccess { filename ->
                        Toast.makeText(context, "已导出 $filename", Toast.LENGTH_LONG).show()
                    }
                    .onFailure { error ->
                        Toast.makeText(context, error.message ?: "导出失败", Toast.LENGTH_LONG).show()
                    }
            }
        },
        onImport = {
            filePicker.launch(
                arrayOf(
                    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                    "application/vnd.ms-excel",
                    "application/octet-stream",
                ),
            )
        },
        onInvite = {
            showInviteDialog = true
            if (isHouseholdOwner) {
                viewModel.refreshJoinRequests()
                viewModel.refreshMembers()
            }
        },
        onHelp = {
            showHelpDialog = true
        },
        onDraftsClick = {
            showDraftsDialog = true
        },
        draftCount = draftsUi.drafts.size,
        onSignOut = {
            scope.launch {
                authRepository.logout()
                database.clearAll()
                onSignedOut()
            }
        },
    )

    if (showInviteDialog) {
        InviteDialog(
            state = inviteState,
            joinRequests = joinRequestsState,
            households = householdsState.households,
            currentHouseholdId = householdsState.currentHouseholdId,
            isOwner = isHouseholdOwner,
            onGenerate = viewModel::generateInvitationLink,
            onRefreshRequests = viewModel::refreshJoinRequests,
            onApproveRequest = viewModel::approveRequest,
            onRejectRequest = viewModel::rejectRequest,
            members = membersUi,
            downloadUrl = "${AppConfig.baseUrl}apk/home-inventory-internal-latest.apk",
            onRefreshMembers = viewModel::refreshMembers,
            onRemoveMember = viewModel::removeMember,
            onChangeRole = viewModel::setMemberRole,
            onDismiss = {
                showInviteDialog = false
                viewModel.clearInvitation()
            },
        )
    }

    if (showItemForm) {
        ItemFormDialog(
            title = when {
                editingDraftId != null -> "编辑草稿"
                editingItem == null -> "新增物品"
                else -> "编辑物品"
            },
            initial = ItemFormValues(
                name = editingDraft?.name ?: editingItem?.name ?: "",
                areaId = defaultAreaId,
                locationId = defaultLocationId,
                note = editingDraft?.note ?: editingItem?.note ?: "",
                expireDate = editingDraft?.expireDate ?: editingItem?.expireDate,
                photoKey = editingDraft?.photoKey ?: editingItem?.photoKey ?: "",
            ),
            areas = state.areas,
            locations = state.locations,
            isSaving = isSaving,
            errorMessage = formError,
            onRecognize = viewModel::recognizeItemPhoto,
            onAddPhoto = repository::uploadThumbnailOnly,
            onSaveToDraft = { values, bytes ->
                viewModel.saveToDraft(
                    DraftSaveInput(
                        bytes = bytes,
                        name = values.name,
                        note = values.note,
                        expireDate = values.expireDate,
                        areaId = values.areaId.ifBlank { null },
                        locationId = values.locationId.ifBlank { null },
                        photoKey = values.photoKey?.takeIf { it.isNotBlank() },
                    ),
                )
                lastItemAreaId = values.areaId
                lastItemLocationId = values.locationId
                showItemForm = false
            },
            onAddArea = {
                formError = null
                showAreaForm = true
            },
            onAddLocation = { areaId ->
                locationFormInitialAreaId = areaId
                formError = null
                showLocationForm = true
            },
            onBatchImportToDrafts = viewModel::batchImportToDrafts,
            batchProgress = if (batchState.isImporting) {
                "${batchState.done}/${batchState.total}"
            } else {
                null
            },
            showDraftButton = editingItem == null && editingDraftId == null,
            loadCurrentPhoto = {
                val draftId = editingDraftId
                if (draftId != null && editingDraft != null) {
                    viewModel.readDraftPhoto(draftId, editingDraft.photoKey)
                } else {
                    val editing = editingItem
                    if (editing == null) {
                        Result.failure(IllegalStateException("无图片"))
                    } else {
                        editing.photoKey?.let { key ->
                            LocalPhotoStore.read(context, key, 256)?.let { Result.success(it) }
                        } ?: viewModel.itemPhoto(editing.id)
                    }
                }
            },
            onSave = { values ->
                val draftId = editingDraftId
                if (draftId != null) {
                    viewModel.confirmSaveDraft(draftId, values)
                    editingDraftId = null
                    showItemForm = false
                    formError = null
                    return@ItemFormDialog
                }
                scope.launch {
                    val validation = validateItemForm(values.name, values.note)
                    if (!validation.isValid) {
                        formError = validation.message
                        return@launch
                    }
                    isSaving = true
                    val locationId = values.locationId.ifBlank { null }
                    val result = if (editingItem == null) {
                        repository.createItemOnline(values.name, values.note, values.expireDate, locationId, values.photoKey)
                    } else {
                        repository.updateItemOnline(
                            editingItem!!.id,
                            values.name,
                            values.note,
                            values.expireDate,
                            locationId,
                            values.photoKey,
                        )
                    }
                    result
                        .onSuccess {
                            if (editingItem == null) {
                                lastItemAreaId = values.areaId
                                lastItemLocationId = values.locationId
                            }
                            isSaving = false
                            formError = null
                            showItemForm = false
                        }
                        .onFailure { error ->
                            if (isNetworkError(error)) {
                                if (editingItem == null) {
                                    repository.createItemOffline(values.name, values.note, values.expireDate, locationId)
                                } else {
                                    repository.updateItemOffline(
                                        editingItem!!.id,
                                        editingItem!!.id,
                                        editingItem!!.serverUpdatedAt,
                                        values.name,
                                        values.note,
                                        values.expireDate,
                                        locationId,
                                    )
                                }
                                isSaving = false
                                formError = null
                                showItemForm = false
                            } else {
                                isSaving = false
                                formError = error.message
                            }
                        }
                }
            },
            onDismiss = {
                showItemForm = false
                editingDraftId = null
                formError = null
            },
            onDelete = editingItem?.let { item ->
                {
                    scope.launch {
                        repository.deleteItemOnline(item.id)
                            .onFailure { error ->
                                if (isNetworkError(error)) {
                                    repository.deleteItemOffline(item.id, item.id, item.serverUpdatedAt)
                                }
                            }
                        showItemForm = false
                    }
                }
            },
        )
    }

    if (showHelpDialog) {
        HelpDialog(
            onSubmitFeedback = feedbackRepository::submitFeedback,
            onDismiss = {
                showHelpDialog = false
            },
        )
    }

    householdNameDialog?.let { target ->
        RenameHouseholdDialog(
            title = target.title,
            confirmText = target.confirmText,
            fieldLabel = if (target is HouseholdNameDialogTarget.DisplayName) "显示名" else "名称",
            allowBlank = target is HouseholdNameDialogTarget.DisplayName,
            initialName = target.initialName,
            onRename = { name ->
                val result = when (target) {
                    HouseholdNameDialogTarget.Create -> repository.createHousehold(name)
                    is HouseholdNameDialogTarget.DisplayName ->
                        repository.setHouseholdDisplayName(target.household.id, name)
                }
                if (result.isSuccess) {
                    viewModel.refreshHouseholds()
                }
                result
            },
            onDismiss = {
                householdNameDialog = null
            },
        )
    }

    if (showDraftsDialog) {
        DraftsDialog(
            drafts = draftsUi.drafts,
            savingDraftId = draftsUi.savingDraftId,
            errorMessage = draftsUi.errorMessage,
            readPhoto = { draft ->
                viewModel.readDraftPhoto(draft.id, draft.photoKey).getOrNull()
            },
            onPhotoClick = { draft ->
                previewDraft = draft
            },
            onEdit = { draft ->
                editingDraftId = draft.id
                showDraftsDialog = false
                formError = null
                showItemForm = true
            },
            onConfirm = { draft ->
                lastItemAreaId = draft.areaId ?: ""
                lastItemLocationId = draft.locationId ?: ""
                viewModel.confirmSaveDraft(
                    draft.id,
                    ItemFormValues(
                        name = draft.name,
                        areaId = draft.areaId ?: "",
                        locationId = draft.locationId ?: "",
                        note = draft.note,
                        expireDate = draft.expireDate,
                        photoKey = draft.photoKey,
                    ),
                )
            },
            onDelete = { draft ->
                viewModel.deleteDraft(draft.id)
            },
            onDismiss = {
                showDraftsDialog = false
            },
        )
    }

    if (showLocationForm) {
        LocationFormDialog(
            title = if (editingLocation == null) "新增位置" else "编辑位置",
            initial = editingLocation?.let { location ->
                LocationFormValues(
                    name = location.name,
                    areaId = location.areaId ?: "",
                )
            } ?: LocationFormValues(
                name = "",
                areaId = locationFormInitialAreaId,
            ),
            photoKey = editingLocation?.photoKey,
            onUploadPhoto = { bytes ->
                editingLocation?.let { location ->
                    repository.uploadLocationPhoto(location.id, bytes)
                } ?: Result.failure(IllegalStateException("请先保存位置"))
            },
            onViewPhoto = {
                editingLocation?.let { location ->
                    previewLocationPhoto = EntityPhotoPreview(location.id, location.photoKey)
                }
            },
            onDeletePhoto = {
                editingLocation?.let { location ->
                    repository.deleteLocationPhoto(location.id)
                } ?: Result.success(Unit)
            },
            areas = state.areas,
            isSaving = isSaving,
            errorMessage = formError,
            onSave = { values ->
                scope.launch {
                    val validation = validateLocationForm(values.name)
                    if (!validation.isValid) {
                        formError = validation.message
                        return@launch
                    }
                    isSaving = true
                    val areaId = values.areaId.takeUnless { it == UNASSIGNED_MARKER || it.isBlank() }
                    val location = editingLocation
                    val result = if (location == null) {
                        repository.createLocationOnline(values.name, areaId)
                    } else {
                        repository.updateLocationOnline(location.id, values.name, areaId)
                    }
                    result
                        .onSuccess {
                            isSaving = false
                            formError = null
                            showLocationForm = false
                            editingLocation = null
                        }
                        .onFailure { error ->
                            if (isNetworkError(error)) {
                                if (location == null) {
                                    repository.createLocationOffline(values.name, areaId)
                                }
                                isSaving = false
                                showLocationForm = false
                                editingLocation = null
                            } else {
                                isSaving = false
                                formError = error.message
                            }
                        }
                }
            },
            onDismiss = {
                showLocationForm = false
                editingLocation = null
                formError = null
            },
            onDelete = editingLocation?.let { location ->
                {
                    scope.launch {
                        repository.deleteLocationOnline(location.id)
                            .onFailure { error ->
                                if (!isNetworkError(error)) {
                                    formError = error.message
                                }
                            }
                        showLocationForm = false
                        editingLocation = null
                        formError = null
                    }
                }
            },
        )
    }

    if (showAreaForm) {
        AreaFormDialog(
            title = if (editingArea == null) "新增区域" else "编辑区域",
            initial = editingArea?.let { area ->
                AreaFormValues(name = area.name, color = area.color)
            } ?: AreaFormValues(),
            photoKey = editingArea?.photoKey,
            onUploadPhoto = { bytes ->
                editingArea?.let { area ->
                    repository.uploadAreaPhoto(area.id, bytes)
                } ?: Result.failure(IllegalStateException("请先保存区域"))
            },
            onViewPhoto = {
                editingArea?.let { area ->
                    previewAreaPhoto = EntityPhotoPreview(area.id, area.photoKey)
                }
            },
            onDeletePhoto = {
                editingArea?.let { area ->
                    repository.deleteAreaPhoto(area.id)
                } ?: Result.success(Unit)
            },
            isSaving = isSaving,
            errorMessage = formError,
            onSave = { values ->
                scope.launch {
                    val validation = validateAreaForm(values.name)
                    if (!validation.isValid) {
                        formError = validation.message
                        return@launch
                    }
                    isSaving = true
                    val area = editingArea
                    val result = if (area == null) {
                        repository.createAreaOnline(values.name, values.color)
                    } else {
                        repository.updateAreaOnline(area.id, values.name, values.color)
                    }
                    result
                        .onSuccess {
                            isSaving = false
                            formError = null
                            showAreaForm = false
                            editingArea = null
                        }
                        .onFailure { error ->
                            if (isNetworkError(error)) {
                                if (area == null) {
                                    repository.createAreaOffline(values.name, values.color)
                                }
                                isSaving = false
                                showAreaForm = false
                                editingArea = null
                            } else {
                                isSaving = false
                                formError = error.message
                            }
                        }
                }
            },
            onDismiss = {
                showAreaForm = false
                editingArea = null
                formError = null
            },
            onDelete = editingArea?.let { area ->
                {
                    scope.launch {
                        repository.deleteAreaOnline(area.id)
                            .onFailure { error ->
                                if (!isNetworkError(error)) {
                                    formError = error.message
                                }
                            }
                        showAreaForm = false
                        editingArea = null
                        formError = null
                    }
                }
            },
        )
    }

    importPreview?.let { preview ->
        ImportPreviewDialog(
            preview = preview,
            isCommitting = isCommittingImport,
            errorMessage = importError,
            onResolveConflict = { conflictId, resolution ->
                conflictResolutions[conflictId] = resolution
            },
            onCommit = {
                scope.launch {
                    isCommittingImport = true
                    importExportRepository.commitImport(
                        rows = preview.rows,
                        conflictResolutions = conflictResolutions.toMap(),
                    )
                        .onSuccess { summary ->
                            isCommittingImport = false
                            importPreview = null
                            importError = null
                            Toast.makeText(
                                context,
                                ImportSummaryMessage(summary),
                                Toast.LENGTH_LONG,
                            ).show()
                            repository.syncPendingOperations()
                            repository.refreshSnapshot()
                        }
                        .onFailure { error ->
                            isCommittingImport = false
                            importError = error.message
                        }
                }
            },
            onDismiss = {
                importPreview = null
                importError = null
            },
        )
    }

    if (showAreaPhotoPrompt || showLocationPhotoPrompt) {
        val target = pendingPhotoEntity
        AlertDialog(
            onDismissRequest = {
                showAreaPhotoPrompt = false
                showLocationPhotoPrompt = false
            },
            title = {
                Text(if (showAreaPhotoPrompt) "还没有区域照片" else "还没有位置照片")
            },
            text = {
                Text("拍照或从相册选择")
            },
            confirmButton = {
                TextButton(
                    onClick = {
                        showAreaPhotoPrompt = false
                        showLocationPhotoPrompt = false
                        target?.let { launchEntityCamera(it) }
                    },
                ) {
                    Text("拍照")
                }
            },
            dismissButton = {
                TextButton(
                    onClick = {
                        showAreaPhotoPrompt = false
                        showLocationPhotoPrompt = false
                        target?.let { launchEntityGallery(it) }
                    },
                ) {
                    Text("从相册选择")
                }
            },
        )
    }

    previewAreaPhoto?.let { preview ->
        PhotoPreviewDialog(
            title = "区域照片",
            loadBitmap = {
                preview.photoKey?.let { key ->
                    LocalPhotoStore.read(context, key, 1600)?.let { Result.success(it) }
                } ?: repository.getAreaPhoto(preview.entityId)
            },
            onDismiss = { previewAreaPhoto = null },
        )
    }

    previewLocationPhoto?.let { preview ->
        PhotoPreviewDialog(
            title = "位置照片",
            loadBitmap = {
                preview.photoKey?.let { key ->
                    LocalPhotoStore.read(context, key, 1600)?.let { Result.success(it) }
                } ?: repository.getLocationPhoto(preview.entityId)
            },
            onDismiss = { previewLocationPhoto = null },
        )
    }

    previewItem?.let { item ->
        PhotoPreviewDialog(
            title = item.name,
            loadBitmap = {
                item.photoKey?.let { key ->
                    LocalPhotoStore.read(context, key, 1600)?.let { Result.success(it) }
                } ?: viewModel.itemPhoto(item.id)
            },
            onDismiss = { previewItem = null },
        )
    }

    previewDraft?.let { draft ->
        PhotoPreviewDialog(
            title = draft.name.ifBlank { "草稿" },
            loadBitmap = {
                viewModel.readDraftPhotoLarge(draft.id, draft.photoKey)
            },
            onDismiss = { previewDraft = null },
        )
    }
}

private fun isNetworkError(error: Throwable): Boolean =
    error.message?.startsWith("无法连接服务器") == true

private sealed class HouseholdNameDialogTarget {
    abstract val title: String
    abstract val confirmText: String
    abstract val initialName: String

    data object Create : HouseholdNameDialogTarget() {
        override val title = "添加新地点"
        override val confirmText = "创建"
        override val initialName = ""
    }

    data class DisplayName(val household: HouseholdDto) : HouseholdNameDialogTarget() {
        override val title = "我的显示名"
        override val confirmText = "保存"
        override val initialName = household.effectiveName ?: household.name
    }
}
