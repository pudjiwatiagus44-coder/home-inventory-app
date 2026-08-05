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
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.window.Dialog
import com.homeinventory.app.data.repository.InventorySnapshot
import com.homeinventory.app.ui.theme.Danger
import com.homeinventory.app.ui.theme.Surface
import com.homeinventory.app.ui.theme.Danger

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun LocationFormDialog(
    title: String,
    initial: LocationFormValues,
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
    modifier: Modifier = Modifier,
) {
    var expanded by remember { mutableStateOf(false) }
    ExposedDropdownMenuBox(
        expanded = expanded,
        onExpandedChange = { expanded = it },
        modifier = modifier,
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
                .fillMaxWidth(),
        )
        ExposedDropdownMenu(
            expanded = expanded,
            onDismissRequest = { expanded = false },
        ) {
            if (includeUnassigned) {
                DropdownMenuItem(
                    text = { Text("未分区") },
                    onClick = {
                        onSelect(UNASSIGNED_MARKER)
                        expanded = false
                    },
                )
            }
            areas.forEach { area ->
                DropdownMenuItem(
                    text = { Text(area.name) },
                    onClick = {
                        onSelect(area.id)
                        expanded = false
                    },
                )
            }
        }
    }
}

const val UNASSIGNED_MARKER = "__unassigned__"
