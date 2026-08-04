package com.homeinventory.app.ui.inventory

import androidx.lifecycle.ViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.update

data class InventoryUiState(
    val isOffline: Boolean = false,
    val syncMessage: String? = "Internal test",
    val items: List<InventoryUiItem> = listOf(
        InventoryUiItem(
            id = "sample-local-item",
            name = "Offline item draft",
            note = "Saved locally and ready to sync",
            locationName = null,
            syncStatus = "pending_create",
        ),
    ),
)

data class InventoryUiItem(
    val id: String,
    val name: String,
    val note: String,
    val locationName: String?,
    val syncStatus: String,
)

class InventoryViewModel : ViewModel() {
    private val _state = MutableStateFlow(InventoryUiState())
    val state: StateFlow<InventoryUiState> = _state

    fun addOfflineDraft() {
        _state.update { current ->
            val nextIndex = current.items.size + 1
            current.copy(
                syncMessage = "Saved offline. Sync starts when network is back.",
                items = listOf(
                    InventoryUiItem(
                        id = "local-item-$nextIndex",
                        name = "New offline item $nextIndex",
                        note = "",
                        locationName = null,
                        syncStatus = "pending_create",
                    ),
                ) + current.items,
            )
        }
    }
}
