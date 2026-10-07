package com.homeinventory.app.ui.dashboard.dialogs

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.unit.dp
import com.homeinventory.app.data.recognition.RecognitionSettings
import com.homeinventory.app.data.remote.DeepSeekCredentialStatusDto
import com.homeinventory.app.data.repository.DeepSeekSettingsRepository
import com.homeinventory.app.ui.components.ClearableOutlinedTextField
import kotlinx.coroutines.launch

@Composable
fun ApiSettingsDialog(settings: RecognitionSettings, repository: DeepSeekSettingsRepository, onDismiss: () -> Unit) {
    val scope = rememberCoroutineScope()
    var provider by remember { mutableStateOf(settings.provider()) }
    var status by remember { mutableStateOf<DeepSeekCredentialStatusDto?>(null) }
    var key by remember { mutableStateOf("") }
    var busy by remember { mutableStateOf(false) }
    var message by remember { mutableStateOf<String?>(null) }
    var confirmDeepSeek by remember { mutableStateOf(false) }
    var confirmDelete by remember { mutableStateOf(false) }

    fun action(operation: suspend () -> Unit) {
        busy = true
        scope.launch { try { operation() } finally { key = ""; busy = false } }
    }
    fun select(value: String) {
        runCatching { settings.select(value) }.onSuccess { provider = value }.onFailure { message = it.message }
    }
    LaunchedEffect(Unit) {
        busy = true
        try {
            repository.status().onSuccess { status = it }.onFailure { message = it.message }
        } finally { busy = false }
    }
    DisposableEffect(Unit) { onDispose { key = "" } }
    AlertDialog(
        onDismissRequest = { key = ""; onDismiss() },
        title = { Text("设置") },
        text = {
            Column(Modifier.fillMaxWidth().verticalScroll(rememberScrollState()), verticalArrangement = Arrangement.spacedBy(12.dp)) {
                Text("识别服务", style = MaterialTheme.typography.titleMedium)
                Row {
                    RadioButton(selected = provider == "DOUBAO", enabled = !busy, onClick = { select("DOUBAO") })
                    Text("默认豆包", modifier = Modifier.padding(top = 12.dp))
                }
                Row {
                    RadioButton(selected = provider == "DEEPSEEK", enabled = !busy && status?.configured == true,
                        onClick = { confirmDeepSeek = true })
                    Text("个人 DeepSeek", modifier = Modifier.padding(top = 12.dp))
                }
                Text("DeepSeek API Key", style = MaterialTheme.typography.titleMedium)
                Text("密钥通过 HTTPS 发送至服务器加密保存，本机不保存明文。同一账号与记账 App 共用，更新或删除会同时影响两端。")
                Text(when (val current = status) {
                    null -> "密钥状态尚未读取"
                    else -> if (current.configured) "已配置：${current.maskedKey.orEmpty()}" else "尚未配置"
                })
                status?.lastVerifiedAt?.let { Text("最近连接检查：$it") }
                ClearableOutlinedTextField(value = key, onValueChange = { key = it }, enabled = !busy,
                    label = { Text("输入自己的 API Key") }, singleLine = true,
                    visualTransformation = PasswordVisualTransformation(), modifier = Modifier.fillMaxWidth())
                Button(enabled = !busy && key.isNotBlank(), onClick = {
                    val submitted = key
                    key = ""
                    action { repository.save(submitted).onSuccess { status = it; message = "已加密保存，请检查连接" }.onFailure { message = it.message } }
                }) { Text("保存密钥") }
                OutlinedButton(enabled = !busy && status?.configured == true, onClick = {
                    action { repository.validate().onSuccess { status = it; message = "连接检查通过" }.onFailure { message = it.message } }
                }) { Text("检查连接") }
                TextButton(enabled = !busy && status?.configured == true, onClick = { confirmDelete = true }) { Text("删除密钥") }
                if (busy) Text("处理中…")
                message?.let { Text(it) }
            }
        },
        confirmButton = { TextButton(onClick = { key = ""; onDismiss() }) { Text("关闭") } },
    )
    if (confirmDeepSeek) AlertDialog(onDismissRequest = { confirmDeepSeek = false }, title = { Text("使用个人 DeepSeek") },
        text = { Text("你主动识别的物品照片将发送至 DeepSeek，费用由你的 API 账号承担。是否使用？") },
        confirmButton = { TextButton(onClick = { select("DEEPSEEK"); confirmDeepSeek = false }) { Text("使用") } },
        dismissButton = { TextButton(onClick = { confirmDeepSeek = false }) { Text("取消") } })
    if (confirmDelete) AlertDialog(onDismissRequest = { confirmDelete = false }, title = { Text("删除 DeepSeek 密钥") },
        text = { Text("同账号的记账 App 和物品 App 都将无法继续使用这份密钥。") },
        confirmButton = { TextButton(onClick = {
            confirmDelete = false
            action { repository.delete().onSuccess { status = DeepSeekCredentialStatusDto(false); select("DOUBAO"); message = "密钥已删除" }.onFailure { message = it.message } }
        }) { Text("删除") } }, dismissButton = { TextButton(onClick = { confirmDelete = false }) { Text("取消") } })
}
