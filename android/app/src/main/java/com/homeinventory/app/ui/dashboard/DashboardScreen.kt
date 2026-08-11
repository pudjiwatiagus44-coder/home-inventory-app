package com.homeinventory.app.ui.dashboard

import android.graphics.Bitmap
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Scaffold
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.pulltorefresh.PullToRefreshBox
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.homeinventory.app.ui.dashboard.components.AreaStrip
import com.homeinventory.app.ui.dashboard.components.FloatingAddButton
import com.homeinventory.app.ui.dashboard.components.ItemList
import com.homeinventory.app.ui.dashboard.components.LocationStrip
import com.homeinventory.app.ui.dashboard.components.SearchBar
import com.homeinventory.app.ui.dashboard.components.TopBar
import com.homeinventory.app.data.repository.InventorySnapshot
import com.homeinventory.app.data.remote.HouseholdDto
import com.homeinventory.app.ui.theme.Background

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun DashboardScreen(
    state: DashboardUiState,
    households: List<HouseholdDto>,
    currentHouseholdId: String?,
    onSwitchHousehold: (String) -> Unit,
    onRenameHousehold: () -> Unit,
    onSearchChange: (String) -> Unit,
    onSelectArea: (String?) -> Unit,
    onSelectLocation: (String?) -> Unit,
    onLongPressArea: (InventorySnapshot.AreaView) -> Unit,
    onLongPressLocation: (InventorySnapshot.LocationView) -> Unit,
    onSortChange: (ItemSortMode) -> Unit,
    onAddItem: () -> Unit,
    onAddLocation: () -> Unit,
    onAddArea: () -> Unit,
    onEditItem: (DashboardUiItem) -> Unit,
    onPhotoClick: (DashboardUiItem) -> Unit,
    onAddPhoto: (DashboardUiItem) -> Unit,
    unassignedFilter: Boolean,
    onToggleUnassigned: () -> Unit,
    loadPhoto: suspend (itemId: String) -> Result<Bitmap>,
    isRefreshing: Boolean,
    onRefresh: () -> Unit,
    onBackup: () -> Unit,
    onImport: () -> Unit,
    onInvite: () -> Unit,
    onHelp: () -> Unit,
    onDraftsClick: () -> Unit,
    draftCount: Int,
    onSignOut: () -> Unit,
    modifier: Modifier = Modifier,
) {
    Scaffold(
        containerColor = Background,
        topBar = {
            TopBar(
                householdName = households.firstOrNull { it.id == currentHouseholdId }?.name,
                households = households,
                currentHouseholdId = currentHouseholdId,
                onSwitchHousehold = onSwitchHousehold,
                onRenameHousehold = onRenameHousehold,
                onDraftsClick = onDraftsClick,
                draftCount = draftCount,
                onBackup = onBackup,
                onImport = onImport,
                onInvite = onInvite,
                onHelp = onHelp,
                onSignOut = onSignOut,
            )
        },
        floatingActionButton = {
            FloatingAddButton(onClick = onAddItem)
        },
    ) { padding ->
        PullToRefreshBox(
            isRefreshing = isRefreshing,
            onRefresh = onRefresh,
            modifier = modifier
                .fillMaxSize()
                .padding(padding),
        ) {
            Column(
                modifier = Modifier
                    .fillMaxSize()
                    .padding(horizontal = 16.dp),
                verticalArrangement = Arrangement.spacedBy(12.dp),
            ) {
                SearchBar(
                    value = state.filters.search,
                    onChange = onSearchChange,
                )
                AreaStrip(
                    areas = state.areas,
                    selectedAreaId = state.filters.areaId,
                    itemCountByArea = state.items.groupBy { it.areaId }.mapValues { it.value.size },
                    onSelectArea = onSelectArea,
                    onAddArea = onAddArea,
                    onLongPressArea = onLongPressArea,
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
                    onLongPressLocation = onLongPressLocation,
                )
                ItemList(
                    items = state.visibleItems,
                    sortMode = state.sortMode,
                    onSortChange = onSortChange,
                    onEditItem = onEditItem,
                    onPhotoClick = onPhotoClick,
                    onAddPhoto = onAddPhoto,
                    unassignedFilter = unassignedFilter,
                    onToggleUnassigned = onToggleUnassigned,
                    loadPhoto = loadPhoto,
                    isEmpty = state.items.isEmpty(),
                    modifier = Modifier.weight(1f),
                )
            }
        }
    }
}
