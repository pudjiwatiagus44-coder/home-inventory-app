package com.homeinventory.app.ui.dashboard

import android.graphics.Bitmap
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.homeinventory.app.data.remote.ApkVersionDto
import com.homeinventory.app.data.remote.JoinRequestDto
import com.homeinventory.app.data.local.DraftEntity
import com.homeinventory.app.data.local.DraftStatus
import com.homeinventory.app.data.repository.DraftGateway
import com.homeinventory.app.data.repository.RecognitionDraft
import com.homeinventory.app.data.repository.InventorySnapshot
import com.homeinventory.app.ui.dashboard.dialogs.ItemFormValues
import java.time.LocalDate
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.flowOf
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
    val photoKey: String? = null,
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

data class UpdateCheckUiState(
    val isChecking: Boolean = false,
    val updateAvailable: Boolean = false,
    val versionName: String? = null,
    val downloadUrl: String? = null,
)

data class DraftsUiState(
    val drafts: List<DraftEntity> = emptyList(),
    val savingDraftId: String? = null,
    val errorMessage: String? = null,
)

data class DraftSaveInput(
    val bytes: ByteArray?,
    val name: String,
    val note: String,
    val expireDate: String?,
    val areaId: String?,
    val locationId: String?,
    val photoKey: String?,
)

data class BatchImportUiState(
    val isImporting: Boolean = false,
    val done: Int = 0,
    val total: Int = 0,
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
    private val checkForUpdate: suspend () -> Result<ApkVersionDto> = {
        Result.failure(IllegalStateException("更新检查不可用"))
    },
    private val recognizePhoto: suspend (mode: String, bytes: ByteArray) -> Result<RecognitionDraft> = { _, _ ->
        Result.failure(IllegalStateException("拍照识别不可用"))
    },
    private val loadPhoto: suspend (itemId: String) -> Result<Bitmap> = {
        Result.failure(IllegalStateException("图片加载不可用"))
    },
    private val draftGateway: DraftGateway? = null,
    private val confirmDraftCreate: suspend (
        name: String,
        note: String,
        expireDate: String?,
        locationId: String?,
        photoKey: String?,
    ) -> Result<Unit> = { _, _, _, _, _ ->
        Result.failure(IllegalStateException("草稿保存不可用"))
    },
    private val localVersionCode: Int = 0,
    private val today: LocalDate = LocalDate.now(),
) : ViewModel() {
    private val filters = MutableStateFlow(DashboardFilters())
    private val sortMode = MutableStateFlow(ItemSortMode.ExpireSoon)
    private val refreshFlag = MutableStateFlow(0)
    private val invite = MutableStateFlow(InviteUiState())
    private val joinRequests = MutableStateFlow(JoinRequestsUiState())
    private val updateCheck = MutableStateFlow(UpdateCheckUiState())
    private val drafts = MutableStateFlow(DraftsUiState())
    private val batchImport = MutableStateFlow(BatchImportUiState())

    val draftsState: StateFlow<DraftsUiState> =
        (draftGateway?.observe() ?: flowOf(emptyList()))
            .combine(drafts) { list, ui -> ui.copy(drafts = list) }
            .stateIn(viewModelScope, SharingStarted.Eagerly, DraftsUiState())

    fun updateCheckState(): StateFlow<UpdateCheckUiState> = updateCheck

    fun checkForUpdates() {
        if (updateCheck.value.isChecking) {
            return
        }

        viewModelScope.launch {
            updateCheck.value = updateCheck.value.copy(isChecking = true)
            checkForUpdate()
                .onSuccess { info ->
                    updateCheck.value = UpdateCheckUiState(
                        isChecking = false,
                        updateAvailable = info.versionCode > localVersionCode,
                        versionName = info.versionName,
                        downloadUrl = info.url,
                    )
                }
                .onFailure {
                    // 更新检查失败不打扰用户：保持无更新状态
                    updateCheck.value = updateCheck.value.copy(isChecking = false)
                }
        }
    }

    fun dismissUpdatePrompt() {
        updateCheck.value = updateCheck.value.copy(updateAvailable = false)
    }

    suspend fun recognizeItemPhoto(mode: String, bytes: ByteArray): Result<RecognitionDraft> =
        recognizePhoto(mode, bytes)

    suspend fun itemPhoto(itemId: String): Result<Bitmap> = loadPhoto(itemId)

    fun saveToDraft(input: DraftSaveInput) {
        val gateway = draftGateway ?: return
        viewModelScope.launch {
            val draft = gateway.create(
                bytes = input.bytes,
                name = input.name,
                note = input.note,
                expireDate = input.expireDate,
                areaId = input.areaId,
                locationId = input.locationId,
                photoKey = input.photoKey,
            )
            if (draft.status == DraftStatus.Recognizing && input.bytes != null) {
                gateway.recognize(draft.id, input.bytes)
            }
        }
    }

    fun confirmSaveDraft(draftId: String, values: ItemFormValues) {
        val gateway = draftGateway ?: return
        viewModelScope.launch {
            drafts.value = drafts.value.copy(
                savingDraftId = draftId,
                errorMessage = null,
            )
            confirmDraftCreate(
                values.name,
                values.note,
                values.expireDate,
                values.locationId.ifBlank { null },
                values.photoKey,
            )
                .onSuccess {
                    gateway.delete(draftId)
                }
                .onFailure { error ->
                    drafts.value = drafts.value.copy(
                        errorMessage = error.message ?: "保存失败",
                    )
                }
            drafts.value = drafts.value.copy(savingDraftId = null)
        }
    }

    fun deleteDraft(draftId: String) {
        viewModelScope.launch {
            draftGateway?.delete(draftId)
        }
    }

    fun readDraftPhoto(draftId: String, photoKey: String?): Result<Bitmap> {
        val gateway = draftGateway
            ?: return Result.failure(IllegalStateException("草稿不可用"))
        val bitmap = gateway.readPhoto(draftId, photoKey)
            ?: return Result.failure(IllegalStateException("无图片"))
        return Result.success(bitmap)
    }

    fun batchImportState(): StateFlow<BatchImportUiState> = batchImport

    fun batchImport(locationId: String?, photos: List<ByteArray>) {
        if (photos.isEmpty() || batchImport.value.isImporting) {
            return
        }
        viewModelScope.launch {
            batchImport.value = BatchImportUiState(
                isImporting = true,
                done = 0,
                total = photos.size,
            )
            photos.forEachIndexed { index, bytes ->
                val recognized = recognizeItemPhoto("name", bytes).getOrNull()
                val name = recognized?.name?.takeIf { it.isNotBlank() } ?: "未识别物品"
                val note = recognized?.note.orEmpty()
                confirmDraftCreate(name, note, null, locationId, recognized?.thumbnailId)
                batchImport.value = batchImport.value.copy(done = index + 1)
            }
            batchImport.value = BatchImportUiState()
        }
    }

    fun batchImportToDrafts(
        areaId: String?,
        locationId: String?,
        photos: List<ByteArray>,
    ) {
        val gateway = draftGateway ?: return
        if (photos.isEmpty() || batchImport.value.isImporting) {
            return
        }
        viewModelScope.launch {
            batchImport.value = BatchImportUiState(
                isImporting = true,
                done = 0,
                total = photos.size,
            )
            photos.forEachIndexed { index, bytes ->
                val draft = gateway.create(
                    bytes = bytes,
                    name = "",
                    note = "",
                    expireDate = null,
                    areaId = areaId,
                    locationId = locationId,
                    photoKey = null,
                )
                gateway.recognize(draft.id, bytes)
                batchImport.value = batchImport.value.copy(done = index + 1)
            }
            batchImport.value = BatchImportUiState()
        }
    }

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
                    photoKey = item.photoKey,
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
