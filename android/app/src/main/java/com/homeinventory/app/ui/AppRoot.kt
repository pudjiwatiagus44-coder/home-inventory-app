package com.homeinventory.app.ui

import androidx.compose.material3.MaterialTheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.lifecycle.viewmodel.compose.viewModel
import com.homeinventory.app.ui.inventory.InventoryScreen
import com.homeinventory.app.ui.inventory.InventoryViewModel

@Composable
fun AppRoot(
    viewModel: InventoryViewModel = viewModel(),
) {
    val state by viewModel.state.collectAsState()

    MaterialTheme {
        InventoryScreen(
            state = state,
            onAddOfflineItem = viewModel::addOfflineDraft,
        )
    }
}
