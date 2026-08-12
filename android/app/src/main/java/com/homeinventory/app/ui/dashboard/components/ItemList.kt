package com.homeinventory.app.ui.dashboard.components

import android.graphics.Bitmap
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.Image
import androidx.compose.foundation.clickable
import androidx.compose.foundation.combinedClickable
import androidx.compose.foundation.ExperimentalFoundationApi
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.TextButton
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.produceState
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.homeinventory.app.ui.dashboard.DashboardUiItem
import com.homeinventory.app.ui.dashboard.ItemSortMode
import com.homeinventory.app.ui.theme.Border
import com.homeinventory.app.ui.theme.MutedForeground
import com.homeinventory.app.ui.theme.Primary
import com.homeinventory.app.ui.theme.SurfaceMuted
import kotlinx.coroutines.launch

@OptIn(ExperimentalFoundationApi::class)
@Composable
fun ItemList(
    items: List<DashboardUiItem>,
    sortMode: ItemSortMode,
    onSortChange: (ItemSortMode) -> Unit,
    onEditItem: (DashboardUiItem) -> Unit,
    onPhotoClick: (DashboardUiItem) -> Unit,
    onAddPhoto: (DashboardUiItem) -> Unit,
    onLocationPhotoClick: (DashboardUiItem) -> Unit,
    onAreaPhotoClick: (DashboardUiItem) -> Unit,
    unassignedFilter: Boolean,
    onToggleUnassigned: () -> Unit,
    loadPhoto: suspend (itemId: String) -> Result<Bitmap>,
    isEmpty: Boolean,
    modifier: Modifier = Modifier,
) {
    val listState = rememberLazyListState()
    val scope = rememberCoroutineScope()
    Column(modifier = modifier) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .combinedClickable(
                    onClick = {
                        scope.launch { listState.animateScrollToItem(0) }
                    },
                    onDoubleClick = {
                        scope.launch { listState.animateScrollToItem(0) }
                    },
                ),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.SpaceBetween,
        ) {
            Text(
                text = "物品",
                fontSize = 16.sp,
                fontWeight = FontWeight.SemiBold,
            )
            TextButton(onClick = onToggleUnassigned) {
                Text(
                    text = if (unassignedFilter) "未分配 ✓" else "未分配",
                    fontSize = 12.sp,
                    color = if (unassignedFilter) Primary else MutedForeground,
                )
            }
            SortMenu(sortMode = sortMode, onSortChange = onSortChange)
        }
        if (isEmpty) {
            Text(
                text = "先创建区域和位置，再添加第一个物品。",
                color = MutedForeground,
                fontSize = 13.sp,
                modifier = Modifier.padding(vertical = 24.dp),
            )
        } else if (items.isEmpty()) {
            Text(
                text = "没有匹配的物品。",
                color = MutedForeground,
                fontSize = 13.sp,
                modifier = Modifier.padding(vertical = 24.dp),
            )
        } else {
            LazyColumn(
                state = listState,
                contentPadding = PaddingValues(bottom = 104.dp),
            ) {
                items(items, key = { it.id }) { item ->
                    ItemRow(
                        item = item,
                        onClick = { onEditItem(item) },
                        onPhotoClick = onPhotoClick,
                        onAddPhoto = onAddPhoto,
                        onLocationPhotoClick = onLocationPhotoClick,
                        onAreaPhotoClick = onAreaPhotoClick,
                        loadPhoto = loadPhoto,
                    )
                }
            }
        }
    }
}

@Composable
private fun SortMenu(
    sortMode: ItemSortMode,
    onSortChange: (ItemSortMode) -> Unit,
) {
    var expanded by remember { mutableStateOf(false) }
    val label = when (sortMode) {
        ItemSortMode.ExpireSoon -> "按过期日 ↑"
        ItemSortMode.ExpireLate -> "按过期日 ↓"
        ItemSortMode.Name -> "按名称"
    }
    Row {
        Text(
            text = label,
            color = MutedForeground,
            fontSize = 12.sp,
            modifier = Modifier.clickable { expanded = true },
        )
        DropdownMenu(expanded = expanded, onDismissRequest = { expanded = false }) {
            DropdownMenuItem(
                text = { Text("按过期日 ↑") },
                onClick = { onSortChange(ItemSortMode.ExpireSoon); expanded = false },
            )
            DropdownMenuItem(
                text = { Text("按过期日 ↓") },
                onClick = { onSortChange(ItemSortMode.ExpireLate); expanded = false },
            )
            DropdownMenuItem(
                text = { Text("按名称") },
                onClick = { onSortChange(ItemSortMode.Name); expanded = false },
            )
        }
    }
}

@Composable
private fun ItemRow(
    item: DashboardUiItem,
    onClick: () -> Unit,
    onPhotoClick: (DashboardUiItem) -> Unit,
    onAddPhoto: (DashboardUiItem) -> Unit,
    onLocationPhotoClick: (DashboardUiItem) -> Unit,
    onAreaPhotoClick: (DashboardUiItem) -> Unit,
    loadPhoto: suspend (itemId: String) -> Result<Bitmap>,
) {
    val thumbnail by produceState<Bitmap?>(
        initialValue = null,
        item.id,
        item.photoKey,
    ) {
        if (item.photoKey != null) {
            value = loadPhoto(item.id).getOrNull()
        }
    }
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clickable(onClick = onClick)
            .padding(vertical = 10.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(8.dp),
    ) {
    if (item.photoKey != null) {
        Box(
            modifier = Modifier
                .size(28.dp)
                .clip(RoundedCornerShape(6.dp))
                .background(SurfaceMuted)
                .clickable {
                    onPhotoClick(item)
                },
            contentAlignment = Alignment.Center,
        ) {
            thumbnail?.let { bitmap ->
                Image(
                    bitmap = bitmap.asImageBitmap(),
                    contentDescription = null,
                    contentScale = ContentScale.Crop,
                    modifier = Modifier.fillMaxSize(),
                )
            } ?: run {
                Text(
                    text = item.name.take(1),
                    color = Primary,
                    fontSize = 12.sp,
                    fontWeight = FontWeight.SemiBold,
                    maxLines = 1,
                )
            }
        }
    } else {
        Box(
            modifier = Modifier
                .size(28.dp)
                .clip(RoundedCornerShape(6.dp))
                .background(SurfaceMuted)
                .clickable {
                    onAddPhoto(item)
                },
            contentAlignment = Alignment.Center,
        ) {
            Text(
                text = item.name.take(1).ifBlank { "物" },
                color = Primary,
                fontSize = 12.sp,
                fontWeight = FontWeight.SemiBold,
                maxLines = 1,
            )
            CameraBadge(
                modifier = Modifier
                    .align(Alignment.BottomEnd)
                    .size(10.dp),
            )
        }
    }
        Column(modifier = Modifier.weight(1f)) {
            Text(
                text = item.name,
                fontSize = 14.sp,
                fontWeight = FontWeight.SemiBold,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
            Row(
                horizontalArrangement = Arrangement.spacedBy(4.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                if (item.locationName != null) {
                    Text(
                        text = item.locationName,
                        color = Primary,
                        fontSize = 11.sp,
                        fontWeight = FontWeight.SemiBold,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                        modifier = Modifier
                            .clip(RoundedCornerShape(6.dp))
                            .background(SurfaceMuted)
                            .clickable { onLocationPhotoClick(item) }
                            .padding(horizontal = 8.dp, vertical = 3.dp),
                    )
                }
                if (item.areaName != null) {
                    Text(
                        text = item.areaName,
                        color = MutedForeground,
                        fontSize = 11.sp,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                        modifier = Modifier
                            .clip(RoundedCornerShape(6.dp))
                            .background(SurfaceMuted)
                            .clickable { onAreaPhotoClick(item) }
                            .padding(horizontal = 8.dp, vertical = 3.dp),
                    )
                }
                if (item.note.isNotBlank()) {
                    Text(
                        text = item.note,
                        color = MutedForeground,
                        fontSize = 11.sp,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                    )
                }
            }
        }
        Column(horizontalAlignment = Alignment.End) {
            Text(
                text = item.expireDate ?: "-",
                fontSize = 11.sp,
                color = MutedForeground,
            )
            Text(
                text = expirationLabel(item.expirationStatus),
                fontSize = 11.sp,
                color = expirationColor(item.expirationStatus),
            )
        }
    }
}

@Composable
private fun CameraBadge(modifier: Modifier = Modifier) {
    Canvas(modifier = modifier) {
        val stroke = 1.dp.toPx()
        val bodyTop = size.height * 0.24f
        drawRoundRect(
            color = Primary,
            topLeft = Offset(size.width * 0.08f, bodyTop),
            size = Size(size.width * 0.84f, size.height * 0.56f),
            cornerRadius = CornerRadius(2.dp.toPx()),
            style = Stroke(stroke),
        )
        drawLine(
            color = Primary,
            start = Offset(size.width * 0.34f, bodyTop),
            end = Offset(size.width * 0.42f, size.height * 0.12f),
            strokeWidth = stroke,
        )
        drawLine(
            color = Primary,
            start = Offset(size.width * 0.42f, size.height * 0.12f),
            end = Offset(size.width * 0.62f, size.height * 0.12f),
            strokeWidth = stroke,
        )
        drawLine(
            color = Primary,
            start = Offset(size.width * 0.62f, size.height * 0.12f),
            end = Offset(size.width * 0.7f, bodyTop),
            strokeWidth = stroke,
        )
        drawCircle(
            color = Primary,
            radius = size.width * 0.15f,
            center = Offset(size.width * 0.5f, size.height * 0.52f),
            style = Stroke(stroke),
        )
    }
}

private fun expirationLabel(status: String): String = when (status) {
    "expired" -> "已过期"
    "soon" -> "即将过期"
    else -> "正常"
}

private fun expirationColor(status: String): androidx.compose.ui.graphics.Color = when (status) {
    "expired" -> com.homeinventory.app.ui.theme.Danger
    "soon" -> Primary
    else -> MutedForeground
}
