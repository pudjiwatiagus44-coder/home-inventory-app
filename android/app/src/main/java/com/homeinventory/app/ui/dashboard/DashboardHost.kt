package com.homeinventory.app.ui.dashboard

import android.content.Context
import android.widget.Toast
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateMapOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.platform.LocalContext
import com.homeinventory.app.data.local.AppDatabase
import com.homeinventory.app.data.excel.BackupRow
import com.homeinventory.app.data.remote.ImportPreviewDto
import com.homeinventory.app.data.repository.AuthRepository
import com.homeinventory.app.data.repository.ImportExportRepository
import com.homeinventory.app.data.repository.InventoryRepository
import com.homeinventory.app.ui.dashboard.dialogs.AreaFormDialog
import com.homeinventory.app.ui.dashboard.dialogs.AreaFormValues
import com.homeinventory.app.ui.dashboard.dialogs.ItemFormDialog
import com.homeinventory.app.ui.dashboard.dialogs.ItemFormValues
import com.homeinventory.app.ui.dashboard.dialogs.InviteDialog
import com.homeinventory.app.ui.dashboard.dialogs.ImportPreviewDialog
import com.homeinventory.app.ui.dashboard.dialogs.ImportSummaryMessage
import com.homeinventory.app.ui.dashboard.dialogs.LocationFormDialog
import com.homeinventory.app.ui.dashboard.dialogs.LocationFormValues
import com.homeinventory.app.ui.dashboard.dialogs.UNASSIGNED_MARKER
import kotlinx.coroutines.launch

@Composable
fun DashboardHost(
    viewModel: DashboardViewModel,
    repository: InventoryRepository,
    authRepository: AuthRepository,
    database: AppDatabase,
    importExportRepository: ImportExportRepository,
    onSignedOut: () -> Unit,
) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    val state by viewModel.state.collectAsState()
    val inviteState by viewModel.invitations().collectAsState()
    val joinRequestsState by viewModel.joinRequestsState().collectAsState()
    var showItemForm by remember { mutableStateOf(false) }
    var showInviteDialog by remember { mutableStateOf(false) }
    var editingItem by remember { mutableStateOf<DashboardUiItem?>(null) }
    var showLocationForm by remember { mutableStateOf(false) }
    var showAreaForm by remember { mutableStateOf(false) }
    var formError by remember { mutableStateOf<String?>(null) }
    var isSaving by remember { mutableStateOf(false) }
    var importPreview by remember { mutableStateOf<ImportPreviewDto?>(null) }
    var importError by remember { mutableStateOf<String?>(null) }
    var isCommittingImport by remember { mutableStateOf(false) }
    val conflictResolutions = remember { mutableStateMapOf<String, String>() }
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
            formError = null
            showItemForm = true
        },
        onAddLocation = {
            formError = null
            showLocationForm = true
        },
        onAddArea = {
            formError = null
            showAreaForm = true
        },
        onEditItem = { item ->
            editingItem = item
            formError = null
            showItemForm = true
        },
        onRefresh = {
            scope.launch {
                repository.syncPendingOperations()
                repository.refreshSnapshot()
            }
        },
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
            viewModel.generateInvitationLink()
            viewModel.refreshJoinRequests()
        },
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
            onRegenerate = viewModel::generateInvitationLink,
            onRefreshRequests = viewModel::refreshJoinRequests,
            onApproveRequest = viewModel::approveRequest,
            onRejectRequest = viewModel::rejectRequest,
            onDismiss = {
                showInviteDialog = false
                viewModel.clearInvitation()
            },
        )
    }

    if (showItemForm) {
        ItemFormDialog(
            title = if (editingItem == null) "新增物品" else "编辑物品",
            initial = ItemFormValues(
                name = editingItem?.name ?: "",
                areaId = editingItem?.areaId ?: "",
                locationId = editingItem?.locationId ?: "",
                note = editingItem?.note ?: "",
                expireDate = editingItem?.expireDate,
            ),
            areas = state.areas,
            locations = state.locations,
            isSaving = isSaving,
            errorMessage = formError,
            onSave = { values ->
                scope.launch {
                    val validation = validateItemForm(values.name, values.note)
                    if (!validation.isValid) {
                        formError = validation.message
                        return@launch
                    }
                    isSaving = true
                    val locationId = values.locationId.ifBlank { null }
                    val result = if (editingItem == null) {
                        repository.createItemOnline(values.name, values.note, values.expireDate, locationId)
                    } else {
                        repository.updateItemOnline(
                            editingItem!!.id,
                            values.name,
                            values.note,
                            values.expireDate,
                            locationId,
                        )
                    }
                    result
                        .onSuccess {
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

    if (showLocationForm) {
        LocationFormDialog(
            title = "新增位置",
            initial = LocationFormValues(),
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
                    repository.createLocationOnline(values.name, areaId)
                        .onSuccess {
                            isSaving = false
                            formError = null
                            showLocationForm = false
                        }
                        .onFailure { error ->
                            if (isNetworkError(error)) {
                                repository.createLocationOffline(values.name, areaId)
                                isSaving = false
                                showLocationForm = false
                            } else {
                                isSaving = false
                                formError = error.message
                            }
                        }
                }
            },
            onDismiss = {
                showLocationForm = false
                formError = null
            },
        )
    }

    if (showAreaForm) {
        AreaFormDialog(
            title = "新增区域",
            initial = AreaFormValues(),
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
                    repository.createAreaOnline(values.name, values.color)
                        .onSuccess {
                            isSaving = false
                            formError = null
                            showAreaForm = false
                        }
                        .onFailure { error ->
                            if (isNetworkError(error)) {
                                repository.createAreaOffline(values.name, values.color)
                                isSaving = false
                                showAreaForm = false
                            } else {
                                isSaving = false
                                formError = error.message
                            }
                        }
                }
            },
            onDismiss = {
                showAreaForm = false
                formError = null
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
}

private fun isNetworkError(error: Throwable): Boolean =
    error.message?.startsWith("无法连接服务器") == true
