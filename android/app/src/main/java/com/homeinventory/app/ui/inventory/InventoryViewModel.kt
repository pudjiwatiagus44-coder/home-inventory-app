package com.homeinventory.app.ui.inventory

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.homeinventory.app.data.remote.RemoteDashboardDto
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

data class InventoryUiState(
    val isOffline: Boolean = false,
    val isLoading: Boolean = false,
    val syncMessage: String? = null,
    val errorMessage: String? = null,
    val householdName: String? = null,
    val items: List<InventoryUiItem> = emptyList(),
)

data class InventoryUiItem(
    val id: String,
    val name: String,
    val note: String,
    val locationName: String?,
    val syncStatus: String,
)

class InventoryViewModel(
    private val loadSnapshot: suspend () -> Result<RemoteDashboardDto>,
) : ViewModel() {
    private val _state = MutableStateFlow(InventoryUiState())
    val state: StateFlow<InventoryUiState> = _state

    fun refreshFromServer() {
        viewModelScope.launch {
            loadFromServer()
        }
    }

    suspend fun loadFromServer() {
        _state.update { current ->
            current.copy(isLoading = true, errorMessage = null)
        }

        loadSnapshot()
            .onSuccess { dashboard ->
                _state.update {
                    it.copy(
                        isLoading = false,
                        householdName = dashboard.household?.name,
                        items = dashboard.toUiItems(),
                        syncMessage = if (dashboard.items.isEmpty()) "清单为空" else null,
                    )
                }
            }
            .onFailure { error ->
                _state.update {
                    it.copy(
                        isLoading = false,
                        errorMessage = error.message ?: "加载清单失败",
                    )
                }
            }
    }

    private fun RemoteDashboardDto.toUiItems(): List<InventoryUiItem> {
        val locationNames = locations.associate { it.id to it.name }

        return items.map { item ->
            InventoryUiItem(
                id = item.id,
                name = item.name,
                note = item.note,
                locationName = item.locationId?.let(locationNames::get),
                syncStatus = "synced",
            )
        }
    }
}
