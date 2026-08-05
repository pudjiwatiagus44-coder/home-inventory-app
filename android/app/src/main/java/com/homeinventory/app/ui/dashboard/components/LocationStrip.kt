package com.homeinventory.app.ui.dashboard.components

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.homeinventory.app.data.repository.InventorySnapshot
import com.homeinventory.app.ui.theme.Border
import com.homeinventory.app.ui.theme.MutedForeground
import com.homeinventory.app.ui.theme.Primary
import com.homeinventory.app.ui.theme.Surface

@Composable
fun LocationStrip(
    locations: List<InventorySnapshot.LocationView>,
    selectedLocationId: String?,
    selectedAreaId: String?,
    itemCountByLocation: Map<String?, Int>,
    onSelectLocation: (String?) -> Unit,
    onClearArea: () -> Unit,
    onAddLocation: () -> Unit,
    modifier: Modifier = Modifier,
) {
    Column(modifier = modifier) {
        Row(
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.SpaceBetween,
        ) {
            Text(
                text = "位置",
                fontSize = 15.sp,
                fontWeight = FontWeight.SemiBold,
            )
            if (selectedAreaId != null) {
                TextButton(onClick = onClearArea) {
                    Text("全部区域", fontSize = 12.sp, color = Primary)
                }
            }
        }
        LazyRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            items(locations, key = { it.id }) { location ->
                val selected = location.id == selectedLocationId
                val count = itemCountByLocation[location.id] ?: 0
                Column(
                    modifier = Modifier
                        .clip(RoundedCornerShape(9.dp))
                        .background(Surface)
                        .border(
                            1.dp,
                            if (selected) Primary else Border,
                            RoundedCornerShape(9.dp),
                        )
                        .size(width = 84.dp, height = 44.dp),
                    horizontalAlignment = Alignment.CenterHorizontally,
                    verticalArrangement = Arrangement.Center,
                ) {
                    Text(
                        text = location.name,
                        fontSize = 12.sp,
                        fontWeight = FontWeight.SemiBold,
                    )
                    Text(
                        text = count.toString(),
                        fontSize = 10.sp,
                        color = MutedForeground,
                    )
                }
            }
            item(key = "add-location") {
                Column(
                    modifier = Modifier
                        .clip(RoundedCornerShape(9.dp))
                        .border(1.dp, Border, RoundedCornerShape(9.dp))
                        .size(width = 84.dp, height = 44.dp),
                    horizontalAlignment = Alignment.CenterHorizontally,
                    verticalArrangement = Arrangement.Center,
                ) {
                    Text("+", fontSize = 16.sp, color = MutedForeground)
                    Text("新增位置", fontSize = 10.sp, color = MutedForeground)
                }
            }
        }
    }
}
