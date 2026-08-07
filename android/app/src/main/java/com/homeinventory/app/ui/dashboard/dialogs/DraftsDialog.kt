package com.homeinventory.app.ui.dashboard.dialogs

import android.graphics.Bitmap
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.window.Dialog
import com.homeinventory.app.data.local.DraftEntity
import com.homeinventory.app.data.local.DraftStatus
import com.homeinventory.app.ui.theme.Danger
import com.homeinventory.app.ui.theme.MutedForeground
import com.homeinventory.app.ui.theme.Primary
import com.homeinventory.app.ui.theme.Surface
import com.homeinventory.app.ui.theme.SurfaceMuted

@Composable
fun DraftsDialog(
    drafts: List<DraftEntity>,
    savingDraftId: String?,
    errorMessage: String?,
    readPhoto: (DraftEntity) -> Bitmap?,
    onPhotoClick: (DraftEntity) -> Unit,
    onEdit: (DraftEntity) -> Unit,
    onConfirm: (DraftEntity) -> Unit,
    onDelete: (DraftEntity) -> Unit,
    onDismiss: () -> Unit,
) {
    Dialog(onDismissRequest = onDismiss) {
        Column(
            modifier = Modifier
                .clip(RoundedCornerShape(12.dp))
                .background(Surface)
                .padding(16.dp)
                .heightIn(max = 640.dp),
        ) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Text(
                    text = "草稿箱",
                    fontSize = 16.sp,
                    fontWeight = FontWeight.SemiBold,
                    modifier = Modifier.weight(1f),
                )
                TextButton(onClick = onDismiss) {
                    Text("关闭")
                }
            }
            errorMessage?.let {
                Text(
                    text = it,
                    color = Danger,
                    fontSize = 12.sp,
                    modifier = Modifier.padding(bottom = 6.dp),
                )
            }
            if (drafts.isEmpty()) {
                Text(
                    text = "暂无草稿",
                    color = MutedForeground,
                    fontSize = 13.sp,
                    modifier = Modifier.padding(vertical = 24.dp),
                )
            } else {
                LazyColumn(contentPadding = PaddingValues(vertical = 4.dp)) {
                    items(drafts, key = { it.id }) { draft ->
                        DraftRow(
                            draft = draft,
                            isSaving = savingDraftId == draft.id,
                            photo = remember(draft.id, draft.photoKey) { readPhoto(draft) },
                            onPhotoClick = { onPhotoClick(draft) },
                            onEdit = { onEdit(draft) },
                            onConfirm = { onConfirm(draft) },
                            onDelete = { onDelete(draft) },
                        )
                    }
                }
            }
        }
    }
}

@Composable
private fun DraftRow(
    draft: DraftEntity,
    isSaving: Boolean,
    photo: Bitmap?,
    onPhotoClick: () -> Unit,
    onEdit: () -> Unit,
    onConfirm: () -> Unit,
    onDelete: () -> Unit,
) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(vertical = 8.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        Box(
            modifier = Modifier
                .size(52.dp)
                .clip(RoundedCornerShape(8.dp))
                .background(SurfaceMuted)
                .clickable(onClick = onPhotoClick),
            contentAlignment = Alignment.Center,
        ) {
            if (photo != null) {
                Image(
                    bitmap = photo.asImageBitmap(),
                    contentDescription = null,
                    contentScale = ContentScale.Crop,
                    modifier = Modifier.size(52.dp),
                )
            } else {
                Text("图", color = Primary, fontSize = 14.sp)
            }
        }
        Column(modifier = Modifier.weight(1f)) {
            val title = if (draft.status == DraftStatus.Recognizing && draft.name.isBlank()) {
                "识别中…"
            } else {
                draft.name.ifBlank { "未命名物品" }
            }
            Text(
                text = title,
                fontSize = 14.sp,
                fontWeight = FontWeight.SemiBold,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
            if (draft.note.isNotBlank()) {
                Text(
                    text = draft.note,
                    fontSize = 12.sp,
                    color = MutedForeground,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
            }
        }
        Column(horizontalAlignment = Alignment.End) {
            OutlinedButton(onClick = onConfirm, enabled = !isSaving) {
                Text(if (isSaving) "保存中…" else "保存")
            }
            Row {
                TextButton(onClick = onEdit, enabled = !isSaving) {
                    Text("编辑", fontSize = 12.sp)
                }
                TextButton(onClick = onDelete, enabled = !isSaving) {
                    Text("删除", color = Danger, fontSize = 12.sp)
                }
            }
        }
    }
}
