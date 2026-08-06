package com.homeinventory.app.ui.dashboard.components

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
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

@Composable
fun ItemList(
    items: List<DashboardUiItem>,
    sortMode: ItemSortMode,
    onSortChange: (ItemSortMode) -> Unit,
    onEditItem: (DashboardUiItem) -> Unit,
    isEmpty: Boolean,
    modifier: Modifier = Modifier,
) {
    Column(modifier = modifier) {
        Row(
            modifier = Modifier.fillMaxWidth(),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.SpaceBetween,
        ) {
            Text(
                text = "物品",
                fontSize = 16.sp,
                fontWeight = FontWeight.SemiBold,
            )
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
                contentPadding = PaddingValues(bottom = 88.dp),
            ) {
                items(items, key = { it.id }) { item ->
                    ItemRow(item = item, onClick = { onEditItem(item) })
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
) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clickable(onClick = onClick)
            .padding(vertical = 10.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        Box(
            modifier = Modifier
                .size(28.dp)
                .clip(RoundedCornerShape(6.dp))
                .background(SurfaceMuted),
            contentAlignment = Alignment.Center,
        ) {
            Text(
                text = item.name.take(1),
                color = Primary,
                fontSize = 12.sp,
                fontWeight = FontWeight.SemiBold,
                maxLines = 1,
            )
        }
        Column(modifier = Modifier.weight(1f)) {
            Text(
                text = item.name,
                fontSize = 14.sp,
                fontWeight = FontWeight.SemiBold,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
            val subtitle = listOfNotNull(item.locationName, item.note.takeIf { it.isNotBlank() })
                .joinToString(" · ")
            if (subtitle.isNotBlank()) {
                Text(
                    text = subtitle,
                    fontSize = 11.sp,
                    color = MutedForeground,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
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
