package com.homeinventory.app.ui.dashboard.dialogs

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
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
import com.homeinventory.app.data.remote.ImportConflictDto
import com.homeinventory.app.data.remote.ImportPreviewDto
import com.homeinventory.app.data.remote.ImportSummaryDto
import com.homeinventory.app.ui.theme.Danger
import com.homeinventory.app.ui.theme.MutedForeground
import com.homeinventory.app.ui.theme.Surface

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ImportPreviewDialog(
    preview: ImportPreviewDto,
    isCommitting: Boolean,
    errorMessage: String?,
    onResolveConflict: (String, String) -> Unit,
    onCommit: () -> Unit,
    onDismiss: () -> Unit,
) {
    Dialog(onDismissRequest = onDismiss) {
        Column(
            modifier = Modifier
                .clip(RoundedCornerShape(12.dp))
                .background(Surface)
                .padding(16.dp)
                .verticalScroll(rememberScrollState()),
            verticalArrangement = Arrangement.spacedBy(10.dp),
        ) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
            ) {
                Text("导入预览", fontSize = 16.sp)
                TextButton(onClick = onDismiss) { Text("取消") }
            }
            Text(
                text = "新增物品 ${preview.creates.size} 条 · 完全相同跳过 ${preview.skipped.size} 条 · 冲突 ${preview.conflicts.size} 条 · 错误 ${preview.errors.size} 条",
                fontSize = 13.sp,
                color = MutedForeground,
            )
            preview.conflicts.forEach { conflict ->
                ConflictRow(
                    conflict = conflict,
                    onResolve = { resolution -> onResolveConflict(conflict.id, resolution) },
                )
            }
            preview.errors.forEach { error ->
                Text(
                    text = "第 ${error.row} 行：${error.message}",
                    fontSize = 12.sp,
                    color = Danger,
                )
            }
            errorMessage?.let {
                Text(text = it, fontSize = 13.sp, color = Danger)
            }
            Button(
                onClick = onCommit,
                enabled = !isCommitting,
                modifier = Modifier.fillMaxWidth(),
            ) {
                Text(if (isCommitting) "导入中..." else "确认导入")
            }
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun ConflictRow(
    conflict: ImportConflictDto,
    onResolve: (String) -> Unit,
) {
    var expanded by remember { mutableStateOf(false) }
    var resolution by remember { mutableStateOf("skip") }
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(8.dp))
            .background(com.homeinventory.app.ui.theme.SurfaceMuted)
            .padding(10.dp),
        verticalArrangement = Arrangement.spacedBy(6.dp),
    ) {
        Text("同格同名物品：${conflict.existingItem.name}", fontSize = 13.sp)
        Text(
            text = "当前：备注「${conflict.existingItem.note}」 有效期「${conflict.existingItem.expireDate ?: "-"}」",
            fontSize = 12.sp,
            color = MutedForeground,
        )
        Text(
            text = "Excel：备注「${conflict.row.note}」 有效期「${conflict.row.expireDate ?: "-"}」",
            fontSize = 12.sp,
            color = MutedForeground,
        )
        ExposedDropdownMenuBox(
            expanded = expanded,
            onExpandedChange = { expanded = it },
        ) {
            OutlinedTextField(
                value = resolutionLabel(resolution),
                onValueChange = {},
                readOnly = true,
                label = { Text("处理方式") },
                trailingIcon = { ExposedDropdownMenuDefaults.TrailingIcon(expanded = expanded) },
                modifier = Modifier
                    .menuAnchor(MenuAnchorType.PrimaryNotEditable)
                    .fillMaxWidth(),
            )
            ExposedDropdownMenu(
                expanded = expanded,
                onDismissRequest = { expanded = false },
            ) {
                listOf("skip", "keep", "overwrite").forEach { value ->
                    DropdownMenuItem(
                        text = { Text(resolutionLabel(value)) },
                        onClick = {
                            resolution = value
                            onResolve(value)
                            expanded = false
                        },
                    )
                }
            }
        }
    }
}

private fun resolutionLabel(value: String): String = when (value) {
    "keep" -> "都保留"
    "overwrite" -> "覆盖"
    else -> "跳过"
}

fun ImportSummaryMessage(summary: ImportSummaryDto): String {
    val parts = buildList {
        if (summary.createdAreas > 0) add("新增区域 ${summary.createdAreas}")
        if (summary.createdLocations > 0) add("新增位置 ${summary.createdLocations}")
        if (summary.createdItems > 0) add("新增物品 ${summary.createdItems}")
        if (summary.overwrittenItems > 0) add("覆盖 ${summary.overwrittenItems}")
        if (summary.keptConflictItems > 0) add("保留重复 ${summary.keptConflictItems}")
        if (summary.skippedItems > 0) add("跳过 ${summary.skippedItems}")
    }
    val base = if (parts.isEmpty()) "导入完成" else parts.joinToString(" · ")
    val errors = summary.errors.take(3).joinToString("；") { "第 ${it.row} 行：${it.message}" }
    return if (errors.isBlank()) base else "$base；失败：$errors"
}
