package com.homeinventory.app.ui.dashboard.dialogs

import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.PickVisualMediaRequest
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.core.content.FileProvider
import com.homeinventory.app.data.media.ImageCompressor
import com.homeinventory.app.data.media.LocalPhotoStore
import com.homeinventory.app.ui.theme.Danger
import com.homeinventory.app.ui.theme.MutedForeground
import java.io.File
import kotlinx.coroutines.launch

@Composable
fun AreaLocationPhotoSection(
    photoKey: String?,
    entityLabel: String,
    onUpload: suspend (ByteArray) -> Result<String>,
    onView: () -> Unit,
    onDelete: suspend () -> Result<Unit>,
) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    var uploading by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }
    val cameraFile = remember {
        File(context.cacheDir, "camera").apply { mkdirs() }
        File(context.cacheDir, "camera/entity_${System.currentTimeMillis()}.jpg")
    }
    val cameraLauncher = rememberLauncherForActivityResult(
        contract = ActivityResultContracts.TakePicture(),
    ) { success ->
        if (success) {
            scope.launch {
                val uri = FileProvider.getUriForFile(
                    context,
                    "${context.packageName}.fileprovider",
                    cameraFile,
                )
                val bytes = ImageCompressor.compressToJpeg(context, uri)
                    ?: cameraFile.readBytes()
                cameraFile.delete()
                uploading = true
                onUpload(bytes)
                    .onSuccess { key ->
                        LocalPhotoStore.save(context, key, bytes)
                        error = null
                    }
                    .onFailure { error = it.message ?: "上传失败" }
                uploading = false
            }
        }
    }
    val galleryLauncher = rememberLauncherForActivityResult(
        contract = ActivityResultContracts.PickVisualMedia(),
    ) { uri ->
        if (uri != null) {
            scope.launch {
                val bytes = ImageCompressor.compressToJpeg(context, uri) ?: ByteArray(0)
                uploading = true
                onUpload(bytes)
                    .onSuccess { key ->
                        LocalPhotoStore.save(context, key, bytes)
                        error = null
                    }
                    .onFailure { error = it.message ?: "上传失败" }
                uploading = false
            }
        }
    }

    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
        Text("${entityLabel}照片", fontSize = 13.sp, fontWeight = FontWeight.SemiBold)
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            OutlinedButton(
                onClick = {
                    cameraFile.parentFile?.mkdirs()
                    cameraLauncher.launch(
                        FileProvider.getUriForFile(
                            context,
                            "${context.packageName}.fileprovider",
                            cameraFile,
                        ),
                    )
                },
                enabled = !uploading,
            ) { Text("拍照") }
            OutlinedButton(
                onClick = {
                    galleryLauncher.launch(
                        PickVisualMediaRequest(ActivityResultContracts.PickVisualMedia.ImageOnly),
                    )
                },
                enabled = !uploading,
            ) { Text("从相册选择") }
            if (photoKey != null) {
                TextButton(onClick = onView) { Text("查看") }
                TextButton(
                    onClick = {
                        scope.launch {
                            onDelete().onSuccess {
                                LocalPhotoStore.delete(context, photoKey)
                            }
                        }
                    },
                ) { Text("删除", color = Danger) }
            }
        }
        if (uploading) Text("上传中...", color = MutedForeground, fontSize = 12.sp)
        error?.let { Text(it, color = Danger, fontSize = 12.sp) }
    }
}
