package com.homeinventory.app.ui.login

import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.ui.text.input.KeyboardType

@Composable
fun ForgotPasswordDialog(
    notice: String?,
    isLoading: Boolean,
    onDismiss: () -> Unit,
    onSubmit: (email: String) -> Unit,
) {
    var email by remember { mutableStateOf("") }

    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("忘记密码") },
        text = {
            if (notice != null) {
                Text(notice)
            } else {
                Column {
                    Text("输入注册邮箱，我们会发送一封密码重置邮件。")
                    OutlinedTextField(
                        value = email,
                        onValueChange = { email = it },
                        modifier = Modifier.fillMaxWidth(),
                        label = { Text("邮箱") },
                        singleLine = true,
                        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Email),
                    )
                }
            }
        },
        confirmButton = {
            if (notice != null) {
                TextButton(onClick = onDismiss) {
                    Text("关闭")
                }
            } else {
                TextButton(
                    onClick = { onSubmit(email) },
                    enabled = !isLoading && email.isNotBlank(),
                ) {
                    Text(if (isLoading) "发送中..." else "发送重置链接")
                }
            }
        },
        dismissButton = {
            if (notice == null) {
                TextButton(onClick = onDismiss) {
                    Text("取消")
                }
            }
        },
    )
}
