package com.homeinventory.app.ui.dashboard.dialogs

import android.app.DatePickerDialog
import android.graphics.Bitmap
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.PickVisualMediaRequest
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.background
import androidx.compose.foundation.Image
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Button
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.ExposedDropdownMenuBox
import androidx.compose.material3.ExposedDropdownMenuDefaults
import androidx.compose.material3.MenuAnchorType
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.OutlinedTextFieldDefaults
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.Alignment
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.window.Dialog
import androidx.core.content.FileProvider
import com.homeinventory.app.data.media.ImageCompressor
import com.homeinventory.app.data.media.LocalPhotoStore
import com.homeinventory.app.data.repository.InventorySnapshot
import com.homeinventory.app.data.repository.RecognitionDraft
import com.homeinventory.app.ui.theme.Border
import com.homeinventory.app.ui.theme.Danger
import com.homeinventory.app.ui.theme.Foreground
import com.homeinventory.app.ui.theme.MutedForeground
import com.homeinventory.app.ui.theme.Surface
import java.io.File
import java.time.LocalDate
import kotlinx.coroutines.launch

@OptIn(ExperimentalMaterial3Api::class, ExperimentalLayoutApi::class)
@Composable
fun ItemFormDialog(
    title: String,
    initial: ItemFormValues,
    areas: List<InventorySnapshot.AreaView>,
    locations: List<InventorySnapshot.LocationView>,
    isSaving: Boolean,
    errorMessage: String?,
    onSave: (ItemFormValues) -> Unit,
    onRecognize: suspend (mode: String, bytes: ByteArray) -> Result<RecognitionDraft>,
    onAddPhoto: suspend (bytes: ByteArray) -> Result<String> = {
        Result.failure(IllegalStateException("添加照片不可用"))
    },
    onSaveToDraft: (ItemFormValues, ByteArray?) -> Unit = { _, _ -> },
    showDraftButton: Boolean = true,
    onAddArea: (() -> Unit)? = null,
    onAddLocation: ((String) -> Unit)? = null,
    onBatchImport: (String?, List<ByteArray>) -> Unit = { _, _ -> },
    batchProgress: String? = null,
    loadCurrentPhoto: suspend () -> Result<Bitmap> = {
        Result.failure(IllegalStateException("图片不可用"))
    },
    onDismiss: () -> Unit,
    onDelete: (() -> Unit)? = null,
) {
    val context = LocalContext.current
    var name by remember { mutableStateOf(initial.name) }
    var areaId by remember { mutableStateOf(initial.areaId) }
    var locationId by remember { mutableStateOf(initial.locationId) }
    var note by remember { mutableStateOf(initial.note) }
    var expireDate by remember { mutableStateOf(initial.expireDate) }
    var photoKey by remember { mutableStateOf(initial.photoKey) }
    val scope = rememberCoroutineScope()
    var recognizing by remember { mutableStateOf<String?>(null) }
    var recognitionError by remember { mutableStateOf<String?>(null) }
    var pendingMode by remember { mutableStateOf<String?>(null) }
    var sourceDialogVisible by remember { mutableStateOf(false) }
    var currentPhoto by remember { mutableStateOf<Bitmap?>(null) }
    var lastPhotoBytes by remember { mutableStateOf<ByteArray?>(null) }
    LaunchedEffect(initial.photoKey) {
        currentPhoto = loadCurrentPhoto().getOrNull()
    }

    fun runRecognition(mode: String?, bytes: ByteArray) {
        val targetMode = mode ?: return
        pendingMode = null
        lastPhotoBytes = bytes
        if (bytes.isEmpty()) {
            recognitionError = "读取照片失败，请重试"
            return
        }
        scope.launch {
            recognizing = targetMode
            recognitionError = null
            onRecognize(targetMode, bytes)
                .onSuccess { draft ->
                    if (draft.name != null) {
                        name = draft.name
                    }
                    if (draft.note != null && note.isBlank()) {
                        note = draft.note
                    }
                    if (draft.expireDate != null) {
                        expireDate = draft.expireDate
                    }
                    if (draft.thumbnailId != null) {
                        photoKey = draft.thumbnailId
                        LocalPhotoStore.save(context, draft.thumbnailId, bytes)
                        currentPhoto = ImageCompressor.bytesToBitmap(bytes)
                    }
                }
                .onFailure { error ->
                    recognitionError = error.message ?: "识别失败，请重试或手动填写"
                }
            recognizing = null
        }
    }

    fun runAddPhoto(bytes: ByteArray) {
        lastPhotoBytes = bytes
        if (bytes.isEmpty()) {
            recognitionError = "读取照片失败，请重试"
            return
        }
        scope.launch {
            recognizing = "photo"
            recognitionError = null
            onAddPhoto(bytes)
                .onSuccess { key ->
                    val old = photoKey
                    photoKey = key
                    LocalPhotoStore.save(context, key, bytes)
                    if (old != null && old != key) {
                        LocalPhotoStore.delete(context, old)
                    }
                    currentPhoto = ImageCompressor.bytesToBitmap(bytes)
                }
                .onFailure { error ->
                    recognitionError = error.message ?: "添加照片失败"
                }
            recognizing = null
        }
    }

    val cameraFile = remember {
        File(context.cacheDir, "camera").apply { mkdirs() }
        File(context.cacheDir, "camera/photo_${System.currentTimeMillis()}.jpg")
    }
    val cameraUri = remember {
        FileProvider.getUriForFile(
            context,
            "${context.packageName}.fileprovider",
            cameraFile,
        )
    }
    val cameraLauncher = rememberLauncherForActivityResult(
        contract = ActivityResultContracts.TakePicture(),
    ) { success ->
        if (success) {
            val bytes = ImageCompressor.compressToJpeg(context, cameraUri)
                ?: cameraFile.readBytes()
            cameraFile.delete()
            if (pendingMode == "photo") {
                runAddPhoto(bytes)
            } else {
                runRecognition(pendingMode, bytes)
            }
        } else {
            pendingMode = null
        }
    }
    val galleryLauncher = rememberLauncherForActivityResult(
        contract = ActivityResultContracts.PickVisualMedia(),
    ) { uri ->
        if (uri != null) {
            val bytes = ImageCompressor.compressToJpeg(context, uri)
            if (pendingMode == "photo") {
                runAddPhoto(bytes ?: ByteArray(0))
            } else {
                runRecognition(pendingMode, bytes ?: ByteArray(0))
            }
        } else {
            pendingMode = null
        }
    }
    val batchLauncher = rememberLauncherForActivityResult(
        contract = ActivityResultContracts.PickMultipleVisualMedia(),
    ) { uris ->
        if (uris.isNotEmpty()) {
            val photos = uris.mapNotNull { uri ->
                ImageCompressor.compressToJpeg(context, uri)
            }
            if (photos.isNotEmpty()) {
                onBatchImport(locationId, photos)
            }
        }
    }

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
            verticalArrangement = Arrangement.spacedBy(10.dp),
        ) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Text(
                    text = title,
                    fontSize = 16.sp,
                    modifier = Modifier.weight(1f),
                )
                currentPhoto?.let { photo ->
                    Image(
                        bitmap = photo.asImageBitmap(),
                        contentDescription = "物品照片",
                        contentScale = ContentScale.Crop,
                        modifier = Modifier
                            .size(44.dp)
                            .clip(RoundedCornerShape(8.dp)),
                    )
                }
            }
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
                onAddArea = onAddArea,
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
                    if (onAddLocation != null && areaId.isNotEmpty()) {
                        DropdownMenuItem(
                            text = { Text("＋ 新增格子") },
                            onClick = {
                                locationExpanded = false
                                onAddLocation(areaId)
                            },
                        )
                    }
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
            FlowRow(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                Button(
                    onClick = {
                        pendingMode = "name"
                        recognitionError = null
                        sourceDialogVisible = true
                    },
                    enabled = recognizing == null,
                ) {
                    Text(if (recognizing == "name") "识别中..." else "识别名称")
                }
                OutlinedButton(
                    onClick = {
                        if (locationId.isBlank()) {
                            recognitionError = "请先选择位置"
                        } else {
                            recognitionError = null
                            batchLauncher.launch(
                                PickVisualMediaRequest(
                                    ActivityResultContracts.PickVisualMedia.ImageOnly,
                                ),
                            )
                        }
                    },
                    enabled = recognizing == null,
                ) {
                    Text(batchProgress?.let { "导入中 $it" } ?: "批量导入")
                }
                OutlinedButton(
                    onClick = {
                        pendingMode = "expiry"
                        recognitionError = null
                        sourceDialogVisible = true
                    },
                    enabled = recognizing == null,
                ) {
                    Text(if (recognizing == "expiry") "识别中..." else "识别日期")
                }
                OutlinedButton(
                    onClick = {
                        pendingMode = "photo"
                        recognitionError = null
                        sourceDialogVisible = true
                    },
                    enabled = recognizing == null,
                ) {
                    Text(if (recognizing == "photo") "上传中..." else "添加照片")
                }
            }
            if (sourceDialogVisible) {
                AlertDialog(
                    onDismissRequest = {
                        sourceDialogVisible = false
                        pendingMode = null
                    },
                    title = {
                        Text(
                            when (pendingMode) {
                                "expiry" -> "选择有效期照片来源"
                                "photo" -> "选择照片来源"
                                else -> "选择物品照片来源"
                            },
                        )
                    },
                    text = {
                        Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                            TextButton(
                                onClick = {
                                    sourceDialogVisible = false
                                    cameraLauncher.launch(cameraUri)
                                },
                            ) {
                                Text("拍照")
                            }
                            TextButton(
                                onClick = {
                                    sourceDialogVisible = false
                                    galleryLauncher.launch(
                                        PickVisualMediaRequest(
                                            ActivityResultContracts.PickVisualMedia.ImageOnly,
                                        ),
                                    )
                                },
                            ) {
                                Text("从相册选择")
                            }
                        }
                    },
                    confirmButton = {},
                )
            }
            recognitionError?.let {
                Text(text = it, color = Danger, fontSize = 13.sp)
            }
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
                horizontalArrangement = Arrangement.spacedBy(8.dp),
                verticalAlignment = Alignment.CenterVertically,
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
                Spacer(modifier = Modifier.weight(1f))
                if (showDraftButton) {
                    OutlinedButton(
                        onClick = {
                            onSaveToDraft(
                                ItemFormValues(
                                    name = name,
                                    areaId = areaId,
                                    locationId = locationId,
                                    note = note,
                                    expireDate = expireDate,
                                    photoKey = photoKey,
                                ),
                                lastPhotoBytes,
                            )
                        },
                        enabled = !isSaving && recognizing == null,
                    ) {
                        Text("存入草稿箱")
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
                                photoKey = photoKey,
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
