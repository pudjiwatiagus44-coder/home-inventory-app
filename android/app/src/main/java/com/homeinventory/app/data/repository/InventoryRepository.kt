package com.homeinventory.app.data.repository

import com.google.gson.Gson
import com.google.gson.JsonParser
import com.homeinventory.app.core.network.HomeInventoryApi
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
import com.homeinventory.app.data.remote.RemoteDashboardDto
import java.util.UUID
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.combine
import okhttp3.ResponseBody

class InventoryRepository(
    private val api: HomeInventoryApi,
    private val areaDao: AreaDao,
    private val locationDao: LocationDao,
    private val itemDao: ItemDao,
    private val pendingOperationDao: PendingOperationDao,
    private val syncStateDao: SyncStateDao,
    private val gson: Gson = Gson(),
) {
    fun observeInventory(): Flow<InventorySnapshot> =
        combine(areaDao.observeAll(), locationDao.observeAll(), itemDao.observeAll()) { areas, locations, items ->
            val locationNames = locations.associate { it.id to it.name }
            val areaIds = locations.associate { it.id to it.areaId }
            InventorySnapshot(
                areas = areas.map { InventorySnapshot.AreaView(it.id, it.name, it.color, it.syncStatus) },
                locations = locations.map {
                    InventorySnapshot.LocationView(it.id, it.name, it.areaId, it.syncStatus)
                },
                items = items.map {
                    InventorySnapshot.ItemView(
                        id = it.id,
                        name = it.name,
                        note = it.note,
                        expireDate = it.expireDate,
                        locationId = it.locationId,
                        areaId = it.locationId?.let { id -> areaIds[id] },
                        locationName = it.locationId?.let { id -> locationNames[id] },
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
        syncStateDao.put(SyncStateEntity(KEY_LAST_SYNC, System.currentTimeMillis().toString()))
        return Result.success(Unit)
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
                    expireDate = item.expireDate,
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
