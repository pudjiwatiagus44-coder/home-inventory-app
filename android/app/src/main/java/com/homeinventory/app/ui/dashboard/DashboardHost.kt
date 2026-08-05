package com.homeinventory.app.ui.dashboard

import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import com.homeinventory.app.data.local.AppDatabase
import com.homeinventory.app.data.repository.AuthRepository
import com.homeinventory.app.data.repository.InventoryRepository
import com.homeinventory.app.ui.dashboard.dialogs.AreaFormDialog
import com.homeinventory.app.ui.dashboard.dialogs.AreaFormValues
import com.homeinventory.app.ui.dashboard.dialogs.ItemFormDialog
import com.homeinventory.app.ui.dashboard.dialogs.ItemFormValues
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
    onSignedOut: () -> Unit,
) {
    val scope = rememberCoroutineScope()
    val state by viewModel.state.collectAsState()
    var showItemForm by remember { mutableStateOf(false) }
    var editingItem by remember { mutableStateOf<DashboardUiItem?>(null) }
    var showLocationForm by remember { mutableStateOf(false) }
    var showAreaForm by remember { mutableStateOf(false) }
    var formError by remember { mutableStateOf<String?>(null) }
    var isSaving by remember { mutableStateOf(false) }

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
        onBackup = { },
        onImport = { },
        onSignOut = {
            scope.launch {
                authRepository.logout()
                database.clearAll()
                onSignedOut()
            }
        },
    )

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
}

private fun isNetworkError(error: Throwable): Boolean =
    error.message?.startsWith("无法连接服务器") == true
