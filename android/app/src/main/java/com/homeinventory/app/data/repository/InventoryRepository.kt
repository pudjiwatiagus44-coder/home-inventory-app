package com.homeinventory.app.data.repository

import com.google.gson.Gson
import com.google.gson.JsonParser
import com.homeinventory.app.core.network.HomeInventoryApi
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import com.homeinventory.app.data.local.AreaDao
import com.homeinventory.app.data.local.AreaEntity
import com.homeinventory.app.data.local.ItemDao
import com.homeinventory.app.data.local.ItemEntity
import com.homeinventory.app.data.local.LocationDao
import com.homeinventory.app.data.local.LocationEntity
import com.homeinventory.app.data.local.PendingOperationDao
import com.homeinventory.app.data.local.PendingOperationEntity
import com.homeinventory.app.data.local.SyncStatus
import com.homeinventory.app.data.local.SyncStateDao
import com.homeinventory.app.data.local.SyncStateEntity
import com.homeinventory.app.data.DateNormalizer
import com.homeinventory.app.data.remote.AreaCreateRequest
import com.homeinventory.app.data.remote.AreaUpdateRequest
import com.homeinventory.app.data.remote.ApkVersionDto
import com.homeinventory.app.data.remote.ApiEnvelope
import com.homeinventory.app.data.remote.CreateInvitationRequest
import com.homeinventory.app.data.remote.ItemCreateRequest
import com.homeinventory.app.data.remote.ItemUpdateRequest
import com.homeinventory.app.data.remote.JoinRequestDto
import com.homeinventory.app.data.remote.LocationCreateRequest
import com.homeinventory.app.data.remote.LocationUpdateRequest
import com.homeinventory.app.data.remote.RemoteAreaDto
import com.homeinventory.app.data.remote.RemoteDashboardDto
import com.homeinventory.app.data.remote.RemoteItemDto
import com.homeinventory.app.data.remote.RemoteLocationDto
import com.homeinventory.app.data.remote.RecognitionResponseDto
import com.homeinventory.app.data.sync.DaoPendingOperationQueue
import com.homeinventory.app.data.sync.RetrofitRemoteSyncClient
import com.homeinventory.app.data.sync.SyncEngine
import java.util.UUID
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.first
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.MultipartBody
import okhttp3.ResponseBody
import okhttp3.RequestBody.Companion.toRequestBody

data class RecognitionDraft(
    val mode: String,
    val name: String? = null,
    val expireDate: String? = null,
    val thumbnailId: String? = null,
)

class InventoryRepository(
    private val api: HomeInventoryApi,
    private val areaDao: AreaDao,
    private val locationDao: LocationDao,
    private val itemDao: ItemDao,
    private val pendingOperationDao: PendingOperationDao,
    private val syncStateDao: SyncStateDao,
    private val gson: Gson = Gson(),
) {
    @Volatile
    private var currentHouseholdId: String? = null

    fun observeInventory(): Flow<InventorySnapshot> =
        combine(areaDao.observeAll(), locationDao.observeAll(), itemDao.observeAll()) { areas, locations, items ->
            val locationNames = locations.associate { it.id to it.name }
            val areaIds = locations.associate { it.id to it.areaId }
            InventorySnapshot(
                areas = areas.map {
                    InventorySnapshot.AreaView(it.id, it.name, it.color, it.serverUpdatedAt, it.syncStatus)
                },
                locations = locations.map {
                    InventorySnapshot.LocationView(it.id, it.name, it.areaId, it.serverUpdatedAt, it.syncStatus)
                },
                items = items.map {
                    InventorySnapshot.ItemView(
                        id = it.id,
                        name = it.name,
                        note = it.note,
                        expireDate = DateNormalizer.normalizeExpireDate(it.expireDate),
                        locationId = it.locationId,
                        areaId = it.locationId?.let { id -> areaIds[id] },
                        locationName = it.locationId?.let { id -> locationNames[id] },
                        photoKey = it.photoKey,
                        serverUpdatedAt = it.serverUpdatedAt,
                        syncStatus = it.syncStatus,
                    )
                },
            )
        }

    suspend fun refreshSnapshot(): Result<Unit> {
        val response = try {
            api.snapshot()
        } catch (_: Exception) {
            return Result.failure(IllegalStateException("无法连接服务器，请检查网络"))
        }
        val body = response.body()
        if (!response.isSuccessful || body?.ok != true || body.data == null) {
            return Result.failure(
                IllegalStateException(parseErrorMessage(response.errorBody()) ?: body?.message ?: "加载清单失败"),
            )
        }
        replaceServerData(body.data)
        currentHouseholdId = body.data.household?.id
        syncStateDao.put(SyncStateEntity(KEY_LAST_SYNC, System.currentTimeMillis().toString()))
        return Result.success(Unit)
    }

    suspend fun createInvitationLink(): Result<String> {
        val householdId = currentHouseholdId

        if (householdId == null) {
            return Result.failure(IllegalStateException("家庭信息未加载，请先刷新清单"))
        }

        val response = try {
            api.createInvitation(CreateInvitationRequest(householdId))
        } catch (_: Exception) {
            return Result.failure(IllegalStateException("无法连接服务器，请检查网络"))
        }
        val body = response.body()

        if (!response.isSuccessful || body?.ok != true || body.data == null) {
            return Result.failure(
                IllegalStateException(
                    parseErrorMessage(response.errorBody()) ?: body?.message ?: "生成邀请链接失败",
                ),
            )
        }

        return Result.success(body.data.url)
    }

    suspend fun listJoinRequests(): Result<List<JoinRequestDto>> {
        val householdId = currentHouseholdId

        if (householdId == null) {
            return Result.failure(IllegalStateException("家庭信息未加载，请先刷新清单"))
        }

        val response = try {
            api.joinRequests(householdId)
        } catch (_: Exception) {
            return Result.failure(IllegalStateException("无法连接服务器，请检查网络"))
        }
        val body = response.body()

        if (!response.isSuccessful || body?.ok != true) {
            return Result.failure(
                IllegalStateException(
                    parseErrorMessage(response.errorBody()) ?: body?.message ?: "加载加入申请失败",
                ),
            )
        }

        return Result.success(body.data ?: emptyList())
    }

    suspend fun approveJoinRequest(requestId: String): Result<Unit> =
        decideJoinRequest { api.approveJoinRequest(requestId) }

    suspend fun rejectJoinRequest(requestId: String): Result<Unit> =
        decideJoinRequest { api.rejectJoinRequest(requestId) }

    private suspend fun decideJoinRequest(
        call: suspend () -> retrofit2.Response<ApiEnvelope<Unit>>,
    ): Result<Unit> {
        val response = try {
            call()
        } catch (_: Exception) {
            return Result.failure(IllegalStateException("无法连接服务器，请检查网络"))
        }
        val body = response.body()

        if (!response.isSuccessful || body?.ok != true) {
            return Result.failure(
                IllegalStateException(
                    parseErrorMessage(response.errorBody()) ?: body?.message ?: "处理申请失败",
                ),
            )
        }

        return Result.success(Unit)
    }

    suspend fun checkForUpdate(): Result<ApkVersionDto> {
        val response = try {
            api.apkVersion()
        } catch (_: Exception) {
            return Result.failure(IllegalStateException("无法连接服务器，请检查网络"))
        }
        val body = response.body()

        if (!response.isSuccessful || body == null) {
            return Result.failure(IllegalStateException("获取版本信息失败"))
        }

        return Result.success(body)
    }

    suspend fun recognizeItemPhoto(
        mode: String,
        jpegBytes: ByteArray,
    ): Result<RecognitionDraft> {
        val body = jpegBytes.toRequestBody("image/jpeg".toMediaType())
        val part = MultipartBody.Part.createFormData("file", "photo.jpg", body)
        val response = try {
            api.recognize(part, mode)
        } catch (_: Exception) {
            return Result.failure(IllegalStateException("无法连接服务器，请检查网络"))
        }
        val envelope = response.body()

        if (!response.isSuccessful || envelope?.ok != true || envelope.data == null) {
            return Result.failure(
                IllegalStateException(
                    parseErrorMessage(response.errorBody()) ?: envelope?.message ?: "识别失败",
                ),
            )
        }

        val data = envelope.data
        return Result.success(
            RecognitionDraft(
                mode = data.mode,
                name = data.name,
                expireDate = data.expireDate,
                thumbnailId = data.thumbnailId,
            ),
        )
    }

    suspend fun loadItemPhoto(itemId: String): Result<Bitmap> {
        val response = try {
            api.itemPhoto(itemId)
        } catch (_: Exception) {
            return Result.failure(IllegalStateException("无法连接服务器，请检查网络"))
        }
        val bytes = response.body()?.bytes()

        if (!response.isSuccessful || bytes == null) {
            return Result.failure(IllegalStateException("加载物品图片失败"))
        }

        val bitmap = BitmapFactory.decodeByteArray(bytes, 0, bytes.size)
            ?: return Result.failure(IllegalStateException("图片数据无效"))
        return Result.success(bitmap)
    }

    suspend fun createItemOffline(
        name: String,
        note: String = "",
        expireDate: String? = null,
        locationId: String? = null,
        nowMillis: Long = System.currentTimeMillis(),
    ): ItemEntity {
        val localId = "local-item-${UUID.randomUUID()}"
        val item = ItemEntity.pendingCreate(
            localId = localId,
            name = name,
            note = note,
            expireDate = expireDate,
            locationId = locationId,
            nowMillis = nowMillis,
        )
        val operation = PendingOperationEntity(
            clientOperationId = "op-${UUID.randomUUID()}",
            entity = "item",
            action = "create",
            localId = localId,
            serverId = null,
            baseServerUpdatedAt = null,
            payloadJson = gson.toJson(
                mapOf(
                    "name" to name,
                    "note" to note,
                    "expireDate" to expireDate,
                    "locationId" to locationId,
                ),
            ),
            state = "pending",
            createdAt = nowMillis,
            errorMessage = null,
        )

        itemDao.upsert(item)
        pendingOperationDao.upsertOperation(operation)

        return item
    }

    suspend fun pendingOperations(): List<PendingOperationEntity> =
        pendingOperationDao.pendingOperations()

    suspend fun createItemOnline(
        name: String,
        note: String,
        expireDate: String?,
        locationId: String?,
        photoKey: String? = null,
    ): Result<Unit> = runOnlineMutation<RemoteItemDto>(
        request = { api.createItem(ItemCreateRequest(name, note, expireDate, locationId, photoKey)) },
        onSuccess = { remoteItem ->
            itemDao.upsert(
                ItemEntity(
                    id = remoteItem.id,
                    serverId = remoteItem.id,
                    locationId = remoteItem.locationId,
                    name = remoteItem.name,
                    note = remoteItem.note,
                    expireDate = DateNormalizer.normalizeExpireDate(remoteItem.expireDate),
                    photoKey = remoteItem.photoKey,
                    serverUpdatedAt = remoteItem.updatedAt,
                    localUpdatedAt = System.currentTimeMillis(),
                    syncStatus = SyncStatus.Synced,
                ),
            )
        },
    )

    suspend fun updateItemOnline(
        serverId: String,
        name: String,
        note: String,
        expireDate: String?,
        locationId: String?,
    ): Result<Unit> = runOnlineMutation<RemoteItemDto>(
        request = { api.updateItem(serverId, ItemUpdateRequest(name, note, expireDate, locationId)) },
        onSuccess = { remoteItem ->
            itemDao.upsert(
                ItemEntity(
                    id = remoteItem.id,
                    serverId = remoteItem.id,
                    locationId = remoteItem.locationId,
                    name = remoteItem.name,
                    note = remoteItem.note,
                    expireDate = DateNormalizer.normalizeExpireDate(remoteItem.expireDate),
                    serverUpdatedAt = remoteItem.updatedAt,
                    localUpdatedAt = System.currentTimeMillis(),
                    syncStatus = SyncStatus.Synced,
                ),
            )
        },
    )

    suspend fun deleteItemOnline(serverId: String): Result<Unit> = runOnlineMutation<Unit>(
        request = { api.deleteItem(serverId) },
        requireData = false,
        onSuccess = { itemDao.deleteById(serverId) },
    )

    suspend fun createAreaOnline(name: String, color: String?): Result<Unit> = runOnlineMutation<RemoteAreaDto>(
        request = { api.createArea(AreaCreateRequest(name, color)) },
        onSuccess = { remoteArea ->
            areaDao.upsert(
                AreaEntity(
                    id = remoteArea.id,
                    serverId = remoteArea.id,
                    name = remoteArea.name,
                    color = remoteArea.color,
                    serverUpdatedAt = remoteArea.updatedAt,
                    localUpdatedAt = System.currentTimeMillis(),
                    syncStatus = SyncStatus.Synced,
                ),
            )
        },
    )

    suspend fun updateAreaOnline(serverId: String, name: String, color: String?): Result<Unit> = runOnlineMutation<RemoteAreaDto>(
        request = { api.updateArea(serverId, AreaUpdateRequest(name, color)) },
        onSuccess = { remoteArea ->
            areaDao.upsert(
                AreaEntity(
                    id = remoteArea.id,
                    serverId = remoteArea.id,
                    name = remoteArea.name,
                    color = remoteArea.color,
                    serverUpdatedAt = remoteArea.updatedAt,
                    localUpdatedAt = System.currentTimeMillis(),
                    syncStatus = SyncStatus.Synced,
                ),
            )
        },
    )

    suspend fun deleteAreaOnline(serverId: String): Result<Unit> = runOnlineMutation<Unit>(
        request = { api.deleteArea(serverId) },
        requireData = false,
        onSuccess = { areaDao.deleteById(serverId) },
    )

    suspend fun createLocationOnline(name: String, areaId: String?): Result<Unit> = runOnlineMutation<RemoteLocationDto>(
        request = { api.createLocation(LocationCreateRequest(name, areaId)) },
        onSuccess = { remoteLocation ->
            locationDao.upsert(
                LocationEntity(
                    id = remoteLocation.id,
                    serverId = remoteLocation.id,
                    areaId = remoteLocation.areaId,
                    name = remoteLocation.name,
                    serverUpdatedAt = remoteLocation.updatedAt,
                    localUpdatedAt = System.currentTimeMillis(),
                    syncStatus = SyncStatus.Synced,
                ),
            )
        },
    )

    suspend fun updateLocationOnline(serverId: String, name: String, areaId: String?): Result<Unit> = runOnlineMutation<RemoteLocationDto>(
        request = { api.updateLocation(serverId, LocationUpdateRequest(name, areaId)) },
        onSuccess = { remoteLocation ->
            locationDao.upsert(
                LocationEntity(
                    id = remoteLocation.id,
                    serverId = remoteLocation.id,
                    areaId = remoteLocation.areaId,
                    name = remoteLocation.name,
                    serverUpdatedAt = remoteLocation.updatedAt,
                    localUpdatedAt = System.currentTimeMillis(),
                    syncStatus = SyncStatus.Synced,
                ),
            )
        },
    )

    suspend fun deleteLocationOnline(serverId: String): Result<Unit> = runOnlineMutation<Unit>(
        request = { api.deleteLocation(serverId) },
        requireData = false,
        onSuccess = { locationDao.deleteById(serverId) },
    )

    suspend fun createAreaOffline(name: String, color: String): AreaEntity {
        val localId = "local-area-${UUID.randomUUID()}"
        val area = AreaEntity(
            id = localId,
            serverId = null,
            name = name,
            color = color,
            serverUpdatedAt = null,
            localUpdatedAt = System.currentTimeMillis(),
            syncStatus = SyncStatus.PendingCreate,
        )
        areaDao.upsert(area)
        pendingOperationDao.upsertOperation(
            PendingOperationEntity(
                clientOperationId = "op-${UUID.randomUUID()}",
                entity = "area",
                action = "create",
                localId = localId,
                serverId = null,
                baseServerUpdatedAt = null,
                payloadJson = gson.toJson(mapOf("name" to name, "color" to color)),
                state = "pending",
                createdAt = System.currentTimeMillis(),
                errorMessage = null,
            ),
        )
        return area
    }

    suspend fun createLocationOffline(name: String, areaId: String?): LocationEntity {
        val localId = "local-location-${UUID.randomUUID()}"
        val location = LocationEntity(
            id = localId,
            serverId = null,
            areaId = areaId,
            name = name,
            serverUpdatedAt = null,
            localUpdatedAt = System.currentTimeMillis(),
            syncStatus = SyncStatus.PendingCreate,
        )
        locationDao.upsert(location)
        pendingOperationDao.upsertOperation(
            PendingOperationEntity(
                clientOperationId = "op-${UUID.randomUUID()}",
                entity = "location",
                action = "create",
                localId = localId,
                serverId = null,
                baseServerUpdatedAt = null,
                payloadJson = gson.toJson(mapOf("name" to name, "areaId" to areaId)),
                state = "pending",
                createdAt = System.currentTimeMillis(),
                errorMessage = null,
            ),
        )
        return location
    }

    suspend fun updateItemOffline(
        localId: String,
        serverId: String?,
        baseServerUpdatedAt: String?,
        name: String,
        note: String,
        expireDate: String?,
        locationId: String?,
    ) {
        itemDao.upsert(
            ItemEntity(
                id = localId,
                serverId = serverId,
                locationId = locationId,
                name = name,
                note = note,
                expireDate = expireDate,
                serverUpdatedAt = baseServerUpdatedAt,
                localUpdatedAt = System.currentTimeMillis(),
                syncStatus = SyncStatus.PendingUpdate,
            ),
        )
        pendingOperationDao.upsertOperation(
            PendingOperationEntity(
                clientOperationId = "op-${UUID.randomUUID()}",
                entity = "item",
                action = "update",
                localId = localId,
                serverId = serverId,
                baseServerUpdatedAt = baseServerUpdatedAt,
                payloadJson = gson.toJson(
                    mapOf(
                        "name" to name,
                        "note" to note,
                        "expireDate" to expireDate,
                        "locationId" to locationId,
                    ),
                ),
                state = "pending",
                createdAt = System.currentTimeMillis(),
                errorMessage = null,
            ),
        )
    }

    suspend fun deleteItemOffline(
        localId: String,
        serverId: String?,
        baseServerUpdatedAt: String?,
    ) {
        val current = itemDao.observeAll().first().firstOrNull { it.id == localId }
        if (current != null) {
            itemDao.upsert(current.copy(syncStatus = SyncStatus.PendingDelete))
        }
        pendingOperationDao.upsertOperation(
            PendingOperationEntity(
                clientOperationId = "op-${UUID.randomUUID()}",
                entity = "item",
                action = "delete",
                localId = localId,
                serverId = serverId,
                baseServerUpdatedAt = baseServerUpdatedAt,
                payloadJson = "{}",
                state = "pending",
                createdAt = System.currentTimeMillis(),
                errorMessage = null,
            ),
        )
    }

    suspend fun syncPendingOperations(): Result<Unit> {
        val engine = SyncEngine(
            queue = DaoPendingOperationQueue(pendingOperationDao),
            remote = RetrofitRemoteSyncClient(api),
            onOperationApplied = { applied ->
                when (applied.entity) {
                    "area" -> areaDao.markSynced(
                        applied.localId.orEmpty(),
                        applied.serverId,
                        applied.serverUpdatedAt.orEmpty(),
                    )
                    "location" -> locationDao.markSynced(
                        applied.localId.orEmpty(),
                        applied.serverId,
                        applied.serverUpdatedAt.orEmpty(),
                    )
                    "item" -> itemDao.markSynced(
                        applied.localId.orEmpty(),
                        applied.serverId,
                        applied.serverUpdatedAt.orEmpty(),
                    )
                }
            },
        )
        return try {
            engine.syncPendingOperations()
            Result.success(Unit)
        } catch (error: Exception) {
            Result.failure(IllegalStateException(error.message ?: "同步失败"))
        }
    }

    private suspend inline fun <T> runOnlineMutation(
        request: () -> retrofit2.Response<ApiEnvelope<T>>,
        requireData: Boolean = true,
        onSuccess: (T) -> Unit,
    ): Result<Unit> {
        val response = try {
            request()
        } catch (_: Exception) {
            return Result.failure(IllegalStateException("无法连接服务器，请检查网络"))
        }
        val body = response.body()
        if (!response.isSuccessful) {
            return Result.failure(IllegalStateException(parseErrorMessage(response.errorBody()) ?: "操作失败"))
        }
        val data = body?.data
        if (body?.ok != true || (requireData && data == null)) {
            return Result.failure(IllegalStateException(body?.message ?: "操作失败"))
        }
        @Suppress("UNCHECKED_CAST")
        val successValue: T = if (requireData) data as T else Unit as T
        onSuccess(successValue)
        return Result.success(Unit)
    }

    private suspend fun replaceServerData(dashboard: RemoteDashboardDto) {
        areaDao.clearAll()
        locationDao.clearAll()
        itemDao.clearAll()
        val now = System.currentTimeMillis()
        dashboard.areas.forEach { area ->
            areaDao.upsert(
                AreaEntity(
                    id = area.id,
                    serverId = area.id,
                    name = area.name,
                    color = area.color,
                    serverUpdatedAt = area.updatedAt,
                    localUpdatedAt = now,
                    syncStatus = SyncStatus.Synced,
                ),
            )
        }
        dashboard.locations.forEach { location ->
            locationDao.upsert(
                LocationEntity(
                    id = location.id,
                    serverId = location.id,
                    areaId = location.areaId,
                    name = location.name,
                    serverUpdatedAt = location.updatedAt,
                    localUpdatedAt = now,
                    syncStatus = SyncStatus.Synced,
                ),
            )
        }
        dashboard.items.forEach { item ->
            itemDao.upsert(
                ItemEntity(
                    id = item.id,
                    serverId = item.id,
                    locationId = item.locationId,
                    name = item.name,
                    note = item.note,
                    expireDate = DateNormalizer.normalizeExpireDate(item.expireDate),
                    photoKey = item.photoKey,
                    serverUpdatedAt = item.updatedAt,
                    localUpdatedAt = now,
                    syncStatus = SyncStatus.Synced,
                ),
            )
        }
    }

    private fun parseErrorMessage(errorBody: ResponseBody?): String? {
        if (errorBody == null) return null
        return try {
            JsonParser.parseString(errorBody.string())
                .asJsonObject["message"]
                ?.asString
        } catch (_: Exception) {
            null
        }
    }

    private companion object {
        const val KEY_LAST_SYNC = "last_sync"
    }
}
