package com.homeinventory.app.ui.dashboard.components

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.homeinventory.app.data.repository.InventorySnapshot
import com.homeinventory.app.ui.theme.Border
import com.homeinventory.app.ui.theme.MutedForeground
import com.homeinventory.app.ui.theme.Primary
import com.homeinventory.app.ui.theme.Surface

@Composable
fun AreaStrip(
    areas: List<InventorySnapshot.AreaView>,
    selectedAreaId: String?,
    itemCountByArea: Map<String?, Int>,
    onSelectArea: (String?) -> Unit,
    onAddArea: () -> Unit,
    modifier: Modifier = Modifier,
) {
    Column(modifier = modifier) {
        Text(
            text = "区域",
            fontSize = 15.sp,
            fontWeight = FontWeight.SemiBold,
        )
        LazyRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            items(areas, key = { it.id }) { area ->
                val selected = area.id == selectedAreaId
                val count = itemCountByArea[area.id] ?: 0
                Column(
                    modifier = Modifier
                        .clip(RoundedCornerShape(9.dp))
                        .background(Surface)
                        .border(
                            width = 1.dp,
                            color = if (selected) Primary else Border,
                            shape = RoundedCornerShape(9.dp),
                        )
                        .size(width = 84.dp, height = 52.dp)
                        .clickable { onSelectArea(area.id) },
                    horizontalAlignment = Alignment.CenterHorizontally,
                    verticalArrangement = Arrangement.Center,
                ) {
                    Row(
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(4.dp),
                    ) {
                        Box(
                            modifier = Modifier
                                .size(8.dp)
                                .clip(CircleShape)
                                .background(Color(android.graphics.Color.parseColor(area.color))),
                        )
                        Text(
                            text = area.name,
                            fontSize = 12.sp,
                            fontWeight = FontWeight.SemiBold,
                            maxLines = 1,
                            overflow = TextOverflow.Ellipsis,
                        )
                    }
                    Text(
                        text = count.toString(),
                        fontSize = 10.sp,
                        color = MutedForeground,
                    )
                }
            }
            item(key = "add-area") {
                Column(
                    modifier = Modifier
                        .clip(RoundedCornerShape(9.dp))
                        .border(1.dp, Border, RoundedCornerShape(9.dp))
                        .size(width = 84.dp, height = 52.dp)
                        .clickable(onClick = onAddArea),
                    horizontalAlignment = Alignment.CenterHorizontally,
                    verticalArrangement = Arrangement.Center,
                ) {
                    Text("+", fontSize = 16.sp, color = MutedForeground)
                    Text("新增区域", fontSize = 10.sp, color = MutedForeground)
                }
            }
        }
    }
}
