package com.homeinventory.app.ui.dashboard.dialogs

import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.sp
import com.homeinventory.app.ui.theme.Danger
import kotlinx.coroutines.launch

@Composable
fun RenameHouseholdDialog(
    initialName: String,
    onRename: suspend (String) -> Result<Unit>,
    onDismiss: () -> Unit,
    title: String = "重命名家庭",
    confirmText: String = "保存",
    fieldLabel: String = "名称",
    allowBlank: Boolean = false,
) {
    var name by remember { mutableStateOf(initialName) }
    var errorMessage by remember { mutableStateOf<String?>(null) }
    var isSaving by remember { mutableStateOf(false) }
    val scope = rememberCoroutineScope()

    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text(title) },
        text = {
            OutlinedTextField(
                value = name,
                onValueChange = { name = it },
                label = { Text(fieldLabel) },
                modifier = Modifier.fillMaxWidth(),
            )
            errorMessage?.let {
                Text(
                    text = it,
                    fontSize = 13.sp,
                    color = Danger,
                )
            }
        },
        confirmButton = {
            TextButton(
                enabled = (allowBlank || name.isNotBlank()) && !isSaving,
                onClick = {
                    scope.launch {
                        isSaving = true
                        errorMessage = null
                        onRename(name.trim())
                            .onSuccess { onDismiss() }
                            .onFailure { error ->
                                isSaving = false
                                errorMessage = error.message ?: "保存失败"
                            }
                    }
                },
            ) {
                Text(if (isSaving) "保存中..." else confirmText)
            }
        },
        dismissButton = {
            TextButton(
                enabled = !isSaving,
                onClick = onDismiss,
            ) {
                Text("取消")
            }
        },
    )
}
