package com.homeinventory.app.ui.dashboard.dialogs

import android.app.DatePickerDialog
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
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
import androidx.compose.material3.OutlinedTextFieldDefaults
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.window.Dialog
import com.homeinventory.app.data.repository.InventorySnapshot
import com.homeinventory.app.ui.theme.Border
import com.homeinventory.app.ui.theme.Danger
import com.homeinventory.app.ui.theme.Foreground
import com.homeinventory.app.ui.theme.MutedForeground
import com.homeinventory.app.ui.theme.Surface
import java.time.LocalDate

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ItemFormDialog(
    title: String,
    initial: ItemFormValues,
    areas: List<InventorySnapshot.AreaView>,
    locations: List<InventorySnapshot.LocationView>,
    isSaving: Boolean,
    errorMessage: String?,
    onSave: (ItemFormValues) -> Unit,
    onDismiss: () -> Unit,
    onDelete: (() -> Unit)? = null,
) {
    val context = LocalContext.current
    var name by remember { mutableStateOf(initial.name) }
    var areaId by remember { mutableStateOf(initial.areaId) }
    var locationId by remember { mutableStateOf(initial.locationId) }
    var note by remember { mutableStateOf(initial.note) }
    var expireDate by remember { mutableStateOf(initial.expireDate) }

    val filteredLocations = locations.filter { location ->
        when (areaId) {
            "" -> false
            UNASSIGNED_MARKER -> location.areaId == null
            else -> location.areaId == areaId
        }
    }

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
                label = { Text("物品名称") },
                singleLine = true,
                modifier = Modifier.fillMaxWidth(),
            )
            AreaDropdown(
                areas = areas,
                selectedAreaId = areaId,
                onSelect = { selected ->
                    areaId = selected
                    locationId = ""
                },
                includeUnassigned = false,
            )
            val locationLabel = when {
                areaId == "" -> "请先选择区域"
                filteredLocations.isEmpty() -> "该区域暂无位置"
                else -> "请选择位置"
            }
            var locationExpanded by remember { mutableStateOf(false) }
            ExposedDropdownMenuBox(
                expanded = locationExpanded,
                onExpandedChange = { if (areaId.isNotEmpty()) locationExpanded = it },
                modifier = Modifier.fillMaxWidth(),
            ) {
                val selectedLocation = locations.firstOrNull { it.id == locationId }
                OutlinedTextField(
                    value = selectedLocation?.name ?: locationLabel,
                    onValueChange = {},
                    readOnly = true,
                    enabled = areaId.isNotEmpty(),
                    label = { Text("位置") },
                    trailingIcon = { ExposedDropdownMenuDefaults.TrailingIcon(expanded = locationExpanded) },
                    modifier = Modifier
                        .menuAnchor(MenuAnchorType.PrimaryNotEditable)
                        .fillMaxWidth(),
                )
                ExposedDropdownMenu(
                    expanded = locationExpanded,
                    onDismissRequest = { locationExpanded = false },
                ) {
                    filteredLocations.forEach { location ->
                        DropdownMenuItem(
                            text = { Text(location.name) },
                            onClick = {
                                locationId = location.id
                                locationExpanded = false
                            },
                        )
                    }
                }
            }
            OutlinedTextField(
                value = note,
                onValueChange = { note = it },
                label = { Text("备注") },
                modifier = Modifier.fillMaxWidth(),
            )
            ExpireDateField(
                expireDate = expireDate,
                onPickDate = { date ->
                    expireDate = date
                },
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
                    onClick = {
                        onSave(
                            ItemFormValues(
                                name = name,
                                areaId = areaId,
                                locationId = locationId,
                                note = note,
                                expireDate = expireDate,
                            ),
                        )
                    },
                    enabled = !isSaving,
                ) {
                    Text(if (isSaving) "保存中..." else "保存")
                }
            }
        }
    }
}

@Composable
private fun ExpireDateField(
    expireDate: String?,
    onPickDate: (String) -> Unit,
) {
    val context = LocalContext.current
    Box(modifier = Modifier.fillMaxWidth()) {
        OutlinedTextField(
            value = expireDate ?: "",
            onValueChange = {},
            readOnly = true,
            enabled = false,
            label = { Text("过期日") },
            placeholder = { Text("可选") },
            colors = OutlinedTextFieldDefaults.colors(
                disabledTextColor = Foreground,
                disabledBorderColor = Border,
                disabledLabelColor = MutedForeground,
                disabledPlaceholderColor = MutedForeground,
                disabledContainerColor = Color.Transparent,
            ),
            modifier = Modifier.fillMaxWidth(),
        )
        Box(
            modifier = Modifier
                .matchParentSize()
                .clickable {
                    DatePickerDialog(
                        context,
                        { _, year, month, day ->
                            onPickDate("%04d-%02d-%02d".format(year, month + 1, day))
                        },
                        LocalDate.now().year,
                        LocalDate.now().monthValue - 1,
                        LocalDate.now().dayOfMonth,
                    ).show()
                },
        )
    }
}
