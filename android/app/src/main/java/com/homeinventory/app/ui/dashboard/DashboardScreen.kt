package com.homeinventory.app.ui.dashboard

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TextField
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.homeinventory.app.ui.dashboard.components.AreaStrip
import com.homeinventory.app.ui.dashboard.components.FloatingAddButton
import com.homeinventory.app.ui.dashboard.components.ItemList
import com.homeinventory.app.ui.dashboard.components.LocationStrip
import com.homeinventory.app.ui.dashboard.components.TopBar
import com.homeinventory.app.ui.theme.Background
import com.homeinventory.app.ui.theme.SurfaceMuted

@Composable
fun DashboardScreen(
    state: DashboardUiState,
    onSearchChange: (String) -> Unit,
    onSelectArea: (String?) -> Unit,
    onSelectLocation: (String?) -> Unit,
    onSortChange: (ItemSortMode) -> Unit,
    onAddItem: () -> Unit,
    onAddLocation: () -> Unit,
    onAddArea: () -> Unit,
    onEditItem: (DashboardUiItem) -> Unit,
    onRefresh: () -> Unit,
    onBackup: () -> Unit,
    onImport: () -> Unit,
    onSignOut: () -> Unit,
    modifier: Modifier = Modifier,
) {
    Scaffold(
        containerColor = Background,
        topBar = {
            TopBar(
                onBackup = onBackup,
                onImport = onImport,
                onSignOut = onSignOut,
            )
        },
        floatingActionButton = {
            FloatingAddButton(onClick = onAddItem)
        },
    ) { padding ->
        Column(
            modifier = modifier
                .fillMaxSize()
                .padding(padding)
                .padding(horizontal = 16.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            TextField(
                value = state.filters.search,
                onValueChange = onSearchChange,
                placeholder = { Text("搜索物品（名称 / 类别 / 位置 / 备注）", fontSize = 13.sp) },
                singleLine = true,
                modifier = Modifier.fillMaxWidth(),
                shape = RoundedCornerShape(12.dp),
            )
            AreaStrip(
                areas = state.areas,
                selectedAreaId = state.filters.areaId,
                itemCountByArea = state.items.groupBy { it.areaId }.mapValues { it.value.size },
                onSelectArea = onSelectArea,
                onAddArea = onAddArea,
            )
            LocationStrip(
                locations = if (state.filters.areaId == null) {
                    state.locations
                } else {
                    state.locations.filter { it.areaId == state.filters.areaId }
                },
                selectedLocationId = state.filters.locationId,
                selectedAreaId = state.filters.areaId,
                itemCountByLocation = state.items.groupBy { it.locationId }.mapValues { it.value.size },
                onSelectLocation = onSelectLocation,
                onClearArea = { onSelectArea(null) },
                onAddLocation = onAddLocation,
            )
            ItemList(
                items = state.visibleItems,
                sortMode = state.sortMode,
                onSortChange = onSortChange,
                onEditItem = onEditItem,
                isEmpty = state.items.isEmpty(),
                modifier = Modifier.weight(1f),
            )
        }
    }
}
