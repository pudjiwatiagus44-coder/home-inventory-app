package com.homeinventory.app.ui.dashboard.dialogs

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.window.Dialog
import com.homeinventory.app.ui.dashboard.DashboardUiItem
import com.homeinventory.app.ui.theme.MutedForeground
import com.homeinventory.app.ui.theme.Surface

@Composable
fun SearchDialog(
    search: String,
    onSearchChange: (String) -> Unit,
    results: List<DashboardUiItem>,
    onPickItem: (DashboardUiItem) -> Unit,
    onDismiss: () -> Unit,
) {
    Dialog(onDismissRequest = onDismiss) {
        Column(
            modifier = Modifier
                .clip(RoundedCornerShape(12.dp))
                .background(Surface)
                .padding(16.dp),
        ) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
            ) {
                Text("搜索物品", fontSize = 16.sp)
                TextButton(onClick = onDismiss) { Text("关闭") }
            }
            OutlinedTextField(
                value = search,
                onValueChange = onSearchChange,
                placeholder = { Text("搜索名称或备注") },
                singleLine = true,
                modifier = Modifier.fillMaxWidth(),
            )
            if (results.isEmpty()) {
                Text(
                    text = "没有匹配的物品。",
                    color = MutedForeground,
                    fontSize = 13.sp,
                    modifier = Modifier.padding(vertical = 16.dp),
                )
            } else {
                LazyColumn(modifier = Modifier.padding(top = 8.dp)) {
                    items(results, key = { it.id }) { item ->
                        Column(
                            modifier = Modifier
                                .fillMaxWidth()
                                .clickable { onPickItem(item) }
                                .padding(vertical = 10.dp),
                        ) {
                            Text(item.name, fontSize = 14.sp)
                            Text(
                                text = listOfNotNull(item.locationName, item.note.takeIf { it.isNotBlank() })
                                    .joinToString(" · "),
                                fontSize = 12.sp,
                                color = MutedForeground,
                            )
                        }
                    }
                }
            }
        }
    }
}
