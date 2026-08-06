package com.homeinventory.app.ui.dashboard

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.homeinventory.app.data.remote.JoinRequestDto
import com.homeinventory.app.data.repository.InventorySnapshot
import java.time.LocalDate
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch

data class DashboardUiItem(
    val id: String,
    val name: String,
    val note: String,
    val expireDate: String?,
    val areaId: String?,
    val locationId: String?,
    val locationName: String?,
    val serverUpdatedAt: String?,
    val syncStatus: String,
    val expirationStatus: String,
)

data class DashboardFilters(
    val search: String = "",
    val areaId: String? = null,
    val locationId: String? = null,
)

enum class ItemSortMode { ExpireSoon, ExpireLate, Name }

data class DashboardUiState(
    val areas: List<InventorySnapshot.AreaView> = emptyList(),
    val locations: List<InventorySnapshot.LocationView> = emptyList(),
    val items: List<DashboardUiItem> = emptyList(),
    val visibleItems: List<DashboardUiItem> = emptyList(),
    val filters: DashboardFilters = DashboardFilters(),
    val sortMode: ItemSortMode = ItemSortMode.ExpireSoon,
    val isRefreshing: Boolean = false,
    val errorMessage: String? = null,
)

data class InviteUiState(
    val isGenerating: Boolean = false,
    val link: String? = null,
    val errorMessage: String? = null,
)

data class JoinRequestsUiState(
    val requests: List<JoinRequestDto> = emptyList(),
    val isLoading: Boolean = false,
    val errorMessage: String? = null,
    val pendingRequestId: String? = null,
)

class DashboardViewModel(
    inventory: Flow<InventorySnapshot>,
    private val syncPending: suspend () -> Result<Unit> = { Result.success(Unit) },
    private val createInvitation: suspend () -> Result<String> = {
        Result.failure(IllegalStateException("邀请功能不可用"))
    },
    private val loadJoinRequests: suspend () -> Result<List<JoinRequestDto>> = {
        Result.success(emptyList())
    },
    private val approveJoinRequest: suspend (String) -> Result<Unit> = {
        Result.failure(IllegalStateException("审批功能不可用"))
    },
    private val rejectJoinRequest: suspend (String) -> Result<Unit> = {
        Result.failure(IllegalStateException("审批功能不可用"))
    },
    private val today: LocalDate = LocalDate.now(),
) : ViewModel() {
    private val filters = MutableStateFlow(DashboardFilters())
    private val sortMode = MutableStateFlow(ItemSortMode.ExpireSoon)
    private val refreshFlag = MutableStateFlow(0)
    private val invite = MutableStateFlow(InviteUiState())
    private val joinRequests = MutableStateFlow(JoinRequestsUiState())

    fun invitations(): StateFlow<InviteUiState> = invite

    fun generateInvitationLink() {
        if (invite.value.isGenerating) {
            return
        }

        viewModelScope.launch {
            invite.value = InviteUiState(isGenerating = true)
            createInvitation()
                .onSuccess { url ->
                    invite.value = InviteUiState(link = url)
                }
                .onFailure { error ->
                    invite.value = InviteUiState(
                        errorMessage = error.message ?: "生成邀请链接失败",
                    )
                }
        }
    }

    fun clearInvitation() {
        invite.value = InviteUiState()
    }

    fun joinRequestsState(): StateFlow<JoinRequestsUiState> = joinRequests

    fun refreshJoinRequests() {
        if (joinRequests.value.isLoading) {
            return
        }

        viewModelScope.launch {
            joinRequests.value = joinRequests.value.copy(
                isLoading = true,
                errorMessage = null,
            )
            loadJoinRequests()
                .onSuccess { requests ->
                    joinRequests.value = JoinRequestsUiState(
                        requests = requests.filter { it.status == "pending" },
                    )
                }
                .onFailure { error ->
                    joinRequests.value = joinRequests.value.copy(
                        isLoading = false,
                        errorMessage = error.message ?: "加载加入申请失败",
                    )
                }
        }
    }

    fun approveRequest(requestId: String) {
        decideRequest(requestId, approveJoinRequest)
    }

    fun rejectRequest(requestId: String) {
        decideRequest(requestId, rejectJoinRequest)
    }

    private fun decideRequest(
        requestId: String,
        action: suspend (String) -> Result<Unit>,
    ) {
        if (joinRequests.value.pendingRequestId != null) {
            return
        }

        viewModelScope.launch {
            joinRequests.value = joinRequests.value.copy(
                pendingRequestId = requestId,
                errorMessage = null,
            )
            action(requestId)
                .onSuccess {
                    joinRequests.value = joinRequests.value.copy(
                        pendingRequestId = null,
                    )
                    refreshJoinRequests()
                }
                .onFailure { error ->
                    joinRequests.value = joinRequests.value.copy(
                        pendingRequestId = null,
                        errorMessage = error.message ?: "处理申请失败",
                    )
                }
        }
    }

    val state: StateFlow<DashboardUiState> =
        combine(inventory, filters, sortMode, refreshFlag) { snapshot, filter, sort, _ ->
            val locationNames = snapshot.locations.associate { it.id to it.name }
            val items = snapshot.items.map { item ->
                DashboardUiItem(
                    id = item.id,
                    name = item.name,
                    note = item.note,
                    expireDate = item.expireDate,
                    areaId = item.areaId,
                    locationId = item.locationId,
                    locationName = item.locationName ?: item.locationId?.let(locationNames::get),
                    serverUpdatedAt = item.serverUpdatedAt,
                    syncStatus = item.syncStatus,
                    expirationStatus = expirationStatus(item.expireDate),
                )
            }
            val visible = filterItems(items, filter, snapshot).sortedWith(itemComparator(sort))
            DashboardUiState(
                areas = snapshot.areas,
                locations = snapshot.locations,
                items = items,
                visibleItems = visible,
                filters = filter,
                sortMode = sort,
            )
        }.stateIn(viewModelScope, SharingStarted.Eagerly, DashboardUiState())

    fun updateSearch(value: String) {
        filters.value = filters.value.copy(search = value)
    }

    fun selectArea(areaId: String?) {
        filters.value = filters.value.copy(areaId = areaId, locationId = null)
    }

    fun selectLocation(locationId: String?) {
        filters.value = filters.value.copy(locationId = locationId)
    }

    fun sortByExpireSoon() {
        sortMode.value = ItemSortMode.ExpireSoon
    }

    fun sortByExpireLate() {
        sortMode.value = ItemSortMode.ExpireLate
    }

    fun sortByName() {
        sortMode.value = ItemSortMode.Name
    }

    fun refresh() {
        viewModelScope.launch {
            syncPending()
            refreshFlag.value += 1
        }
    }

    private fun filterItems(
        items: List<DashboardUiItem>,
        filter: DashboardFilters,
        snapshot: InventorySnapshot,
    ): List<DashboardUiItem> {
        val areaOfItem = snapshot.items.associate { it.id to it.areaId }
        val locationOfItem = snapshot.items.associate { it.id to it.locationId }
        return items.filter { item ->
            val matchesSearch = filter.search.isBlank() ||
                item.name.contains(filter.search, ignoreCase = true) ||
                item.note.contains(filter.search, ignoreCase = true) ||
                item.locationName?.contains(filter.search, ignoreCase = true) == true
            val matchesArea = filter.areaId == null || areaOfItem[item.id] == filter.areaId
            val matchesLocation = filter.locationId == null || locationOfItem[item.id] == filter.locationId
            matchesSearch && matchesArea && matchesLocation
        }
    }

    private fun itemComparator(sort: ItemSortMode): Comparator<DashboardUiItem> = when (sort) {
        ItemSortMode.ExpireSoon -> compareBy(
            { it.expirationStatus != "expired" },
            { it.expireDate ?: "9999-12-31" },
            { it.name },
        )
        ItemSortMode.ExpireLate -> compareByDescending<DashboardUiItem> { it.expireDate ?: "" }
            .thenBy { it.name }
        ItemSortMode.Name -> compareBy { it.name }
    }

    private fun expirationStatus(expireDate: String?): String {
        if (expireDate.isNullOrBlank()) return "normal"
        return try {
            val date = LocalDate.parse(expireDate)
            when {
                date.isBefore(today) -> "expired"
                !date.isAfter(today.plusDays(30)) -> "soon"
                else -> "normal"
            }
        } catch (_: Exception) {
            "normal"
        }
    }
}
