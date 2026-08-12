package com.homeinventory.app.ui.dashboard.dialogs

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Button
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.ExposedDropdownMenuBox
import androidx.compose.material3.ExposedDropdownMenuDefaults
import androidx.compose.material3.MenuAnchorType
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.geometry.Rect
import androidx.compose.ui.layout.boundsInRoot
import androidx.compose.ui.layout.onGloballyPositioned
import androidx.compose.ui.platform.LocalSoftwareKeyboardController
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.window.Dialog
import com.homeinventory.app.data.repository.InventorySnapshot
import com.homeinventory.app.ui.theme.Danger
import com.homeinventory.app.ui.theme.Surface
import kotlinx.coroutines.launch

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun LocationFormDialog(
    title: String,
    initial: LocationFormValues,
    photoKey: String?,
    onUploadPhoto: suspend (ByteArray) -> Result<String>,
    onViewPhoto: () -> Unit,
    onDeletePhoto: suspend () -> Result<Unit>,
    areas: List<InventorySnapshot.AreaView>,
    isSaving: Boolean,
    errorMessage: String?,
    onSave: (LocationFormValues) -> Unit,
    onDismiss: () -> Unit,
    onDelete: (() -> Unit)? = null,
) {
    var name by remember { mutableStateOf(initial.name) }
    var areaId by remember { mutableStateOf(initial.areaId) }

    Dialog(onDismissRequest = onDismiss) {
        Column(
            modifier = Modifier
                .clip(RoundedCornerShape(12.dp))
                .background(Surface)
                .padding(20.dp),
            verticalArrangement = Arrangement.spacedBy(14.dp),
        ) {
            Text(text = title, fontSize = 16.sp)
            OutlinedTextField(
                value = name,
                onValueChange = { name = it },
                label = { Text("位置名称") },
                singleLine = true,
                modifier = Modifier.fillMaxWidth(),
            )
            AreaDropdown(
                areas = areas,
                selectedAreaId = areaId,
                onSelect = { areaId = it },
            )
            AreaLocationPhotoSection(
                photoKey = photoKey,
                entityLabel = "位置",
                onUpload = onUploadPhoto,
                onView = onViewPhoto,
                onDelete = onDeletePhoto,
            )
            errorMessage?.let {
                Text(text = it, color = Danger, fontSize = 13.sp)
            }
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
            ) {
                if (onDelete != null) {
                    TextButton(onClick = onDelete) {
                        Text("删除", color = Danger)
                    }
                } else {
                    TextButton(onClick = onDismiss) {
                        Text("取消")
                    }
                }
                Button(
                    onClick = { onSave(LocationFormValues(name = name, areaId = areaId)) },
                    enabled = !isSaving,
                ) {
                    Text(if (isSaving) "保存中..." else "保存")
                }
            }
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun AreaDropdown(
    areas: List<InventorySnapshot.AreaView>,
    selectedAreaId: String,
    onSelect: (String) -> Unit,
    includeUnassigned: Boolean = true,
    onAddArea: (() -> Unit)? = null,
    onQuickAdd: (suspend (String) -> Result<String>)? = null,
    onFieldBounds: (Rect) -> Unit = {},
    onQuickAddBounds: (Rect?) -> Unit = {},
    onQuickAddModeChange: (Boolean) -> Unit = {},
    modifier: Modifier = Modifier,
) {
    var expanded by remember { mutableStateOf(false) }
    var quickAddMode by remember { mutableStateOf(false) }
    var quickAddName by remember { mutableStateOf("") }
    var quickAddError by remember { mutableStateOf<String?>(null) }
    var quickAdding by remember { mutableStateOf(false) }
    val scope = rememberCoroutineScope()
    val quickAddFocusRequester = remember { FocusRequester() }
    val keyboardController = LocalSoftwareKeyboardController.current
    LaunchedEffect(quickAddMode) {
        if (quickAddMode) {
            quickAddFocusRequester.requestFocus()
            keyboardController?.show()
        }
    }
    Column(modifier = modifier) {
        ExposedDropdownMenuBox(
            expanded = expanded,
            onExpandedChange = { expanded = it },
        ) {
        val selectedName = when {
            selectedAreaId == UNASSIGNED_MARKER -> "未分区"
            else -> areas.firstOrNull { it.id == selectedAreaId }?.name ?: "请选择区域"
        }
        OutlinedTextField(
            value = selectedName,
            onValueChange = {},
            readOnly = true,
            label = { Text("所属区域") },
            trailingIcon = { ExposedDropdownMenuDefaults.TrailingIcon(expanded = expanded) },
            modifier = Modifier
                .menuAnchor(MenuAnchorType.PrimaryNotEditable)
                .fillMaxWidth()
                .onGloballyPositioned { onFieldBounds(it.boundsInRoot()) },
        )
            ExposedDropdownMenu(
                expanded = expanded,
                onDismissRequest = { expanded = false },
            ) {
                if (onQuickAdd != null || onAddArea != null) {
                    DropdownMenuItem(
                        text = { Text("＋ 新增区域") },
                        onClick = {
                            if (onQuickAdd != null) {
                                quickAddMode = true
                                quickAddName = ""
                                quickAddError = null
                                expanded = false
                                onQuickAddModeChange(true)
                            } else {
                                expanded = false
                                onAddArea?.invoke()
                            }
                        },
                    )
                }
                if (includeUnassigned) {
                    DropdownMenuItem(
                        text = { Text("未分区") },
                        onClick = {
                            onSelect(UNASSIGNED_MARKER)
                            expanded = false
                            if (quickAddMode) {
                                quickAddMode = false
                                onQuickAddModeChange(false)
                                onQuickAddBounds(null)
                            }
                        },
                    )
                }
                areas.forEach { area ->
                    DropdownMenuItem(
                        text = { Text(area.name) },
                        onClick = {
                            onSelect(area.id)
                            expanded = false
                            if (quickAddMode) {
                                quickAddMode = false
                                onQuickAddModeChange(false)
                                onQuickAddBounds(null)
                            }
                        },
                    )
                }
            }
        }
        if (quickAddMode && onQuickAdd != null) {
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(top = 8.dp)
                    .onGloballyPositioned { onQuickAddBounds(it.boundsInRoot()) },
                verticalAlignment = Alignment.CenterVertically,
            ) {
                OutlinedTextField(
                    value = quickAddName,
                    onValueChange = { quickAddName = it },
                    placeholder = { Text("区域名，如厨房") },
                    singleLine = true,
                    modifier = Modifier
                        .weight(1f)
                        .focusRequester(quickAddFocusRequester),
                )
                Button(
                    onClick = {
                        val name = quickAddName.trim()
                        if (name.isNotEmpty() && !quickAdding) {
                            quickAddError = null
                            quickAdding = true
                            scope.launch {
                                onQuickAdd(name)
                                    .onSuccess { newId ->
                                        onSelect(newId)
                                        quickAdding = false
                                        quickAddMode = false
                                        quickAddName = ""
                                        onQuickAddModeChange(false)
                                        onQuickAddBounds(null)
                                    }
                                    .onFailure { error ->
                                        quickAdding = false
                                        quickAddError = error.message ?: "新增区域失败"
                                    }
                            }
                        }
                    },
                    enabled = !quickAdding,
                    modifier = Modifier.padding(start = 8.dp),
                ) {
                    Text("添加")
                }
            }
            quickAddError?.let {
                Text(
                    text = it,
                    color = Danger,
                    fontSize = 12.sp,
                    modifier = Modifier.padding(top = 4.dp),
                )
            }
        }
    }
}

const val UNASSIGNED_MARKER = "__unassigned__"
