package com.homeinventory.app.data.repository

import com.homeinventory.app.data.local.AreaDao
import com.homeinventory.app.data.local.AreaEntity
import com.homeinventory.app.data.local.ItemDao
import com.homeinventory.app.data.local.ItemEntity
import com.homeinventory.app.data.local.LocationDao
import com.homeinventory.app.data.local.LocationEntity
import com.homeinventory.app.data.local.PendingOperationDao
import com.homeinventory.app.data.local.PendingOperationEntity
import com.homeinventory.app.data.local.SyncStateDao
import com.homeinventory.app.data.local.SyncStateEntity
import com.homeinventory.app.data.remote.ApiEnvelope
import com.homeinventory.app.data.remote.RemoteAreaDto
import com.homeinventory.app.data.remote.RemoteDashboardDto
import com.homeinventory.app.data.remote.RemoteHouseholdDto
import com.homeinventory.app.data.remote.RemoteItemDto
import com.homeinventory.app.data.remote.RemoteLocationDto
import java.io.IOException
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.test.runTest
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.ResponseBody.Companion.toResponseBody
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import retrofit2.Response

class InventoryRepositoryTest {
    @Test
    fun offlineCreatedItemIsMarkedPendingCreate() {
        val item = ItemEntity.pendingCreate(
            localId = "local-item-1",
            name = "Offline milk",
            note = "",
            expireDate = null,
            locationId = null,
            nowMillis = 123L,
        )

        assertEquals("pending_create", item.syncStatus)
        assertNull(item.serverId)
        assertEquals(123L, item.localUpdatedAt)
    }

    @Test
    fun refreshSnapshotWritesServerDataToRoom() = runTest {
        val dashboard = RemoteDashboardDto(
            household = RemoteHouseholdDto(id = "household-1", name = "我的家"),
            areas = listOf(RemoteAreaDto(id = "area-1", name = "厨房", color = "#ff0000")),
            locations = listOf(RemoteLocationDto(id = "location-1", name = "冰箱", areaId = "area-1")),
            items = listOf(
                RemoteItemDto(
                    id = "item-1",
                    name = "牛奶",
                    note = "",
                    expireDate = null,
                    locationId = "location-1",
                ),
            ),
        )
        val repository = repositoryWith(
            api = FakeSnapshotApi(Response.success(ApiEnvelope(ok = true, data = dashboard))),
        )

        val result = repository.refreshSnapshot()

        assertTrue(result.isSuccess)
        val snapshot = repository.observeInventory().first()
        assertEquals(1, snapshot.areas.size)
        assertEquals("厨房", snapshot.areas[0].name)
        assertEquals(1, snapshot.locations.size)
        assertEquals(1, snapshot.items.size)
        assertEquals("牛奶", snapshot.items[0].name)
        assertEquals("冰箱", snapshot.items[0].locationName)
        assertEquals("area-1", snapshot.items[0].areaId)
    }

    @Test
    fun refreshSnapshotReturnsFailureWithServerMessageWhenResponseFails() = runTest {
        val repository = repositoryWith(
            api = FakeSnapshotApi(
                Response.error(
                    401,
                    """{"ok":false,"message":"Authentication required"}"""
                        .toResponseBody("application/json".toMediaType()),
                ),
            ),
        )

        val result = repository.refreshSnapshot()

        assertTrue(result.isFailure)
        assertEquals("Authentication required", result.exceptionOrNull()?.message)
    }

    @Test
    fun refreshSnapshotReturnsFailureWhenNetworkRequestFails() = runTest {
        val repository = repositoryWith(
            api = FailingSnapshotApi(IOException("timeout")),
        )

        val result = repository.refreshSnapshot()

        assertTrue(result.isFailure)
        assertEquals("无法连接服务器，请检查网络", result.exceptionOrNull()?.message)
    }

    private fun repositoryWith(api: TestApiStub): InventoryRepository =
        InventoryRepository(
            api = api,
            areaDao = FakeAreaDao(),
            locationDao = FakeLocationDao(),
            itemDao = FakeItemDao(),
            pendingOperationDao = FakePendingOperationDao(),
            syncStateDao = FakeSyncStateDao(),
        )
}

private class FakeSnapshotApi(
    private val snapshotResponse: Response<ApiEnvelope<RemoteDashboardDto>>,
) : TestApiStub() {
    override suspend fun snapshot(): Response<ApiEnvelope<RemoteDashboardDto>> = snapshotResponse
}

private class FailingSnapshotApi(
    private val error: Throwable,
) : TestApiStub() {
    override suspend fun snapshot(): Response<ApiEnvelope<RemoteDashboardDto>> {
        throw error
    }
}

private class FakeAreaDao : AreaDao {
    private val state = MutableStateFlow<List<AreaEntity>>(emptyList())

    override fun observeAll(): Flow<List<AreaEntity>> = state

    override suspend fun upsert(area: AreaEntity) {
        state.value = state.value.filterNot { it.id == area.id } + area
    }

    override suspend fun markSynced(localId: String, serverId: String, serverUpdatedAt: String) = Unit

    override suspend fun deleteById(localId: String) {
        state.value = state.value.filterNot { it.id == localId }
    }

    override suspend fun clearAll() {
        state.value = emptyList()
    }
}

private class FakeLocationDao : LocationDao {
    private val state = MutableStateFlow<List<LocationEntity>>(emptyList())

    override fun observeAll(): Flow<List<LocationEntity>> = state

    override suspend fun upsert(location: LocationEntity) {
        state.value = state.value.filterNot { it.id == location.id } + location
    }

    override suspend fun markSynced(localId: String, serverId: String, serverUpdatedAt: String) = Unit

    override suspend fun deleteById(localId: String) {
        state.value = state.value.filterNot { it.id == localId }
    }

    override suspend fun clearAll() {
        state.value = emptyList()
    }
}

private class FakeItemDao : ItemDao {
    private val state = MutableStateFlow<List<ItemEntity>>(emptyList())

    override fun observeAll(): Flow<List<ItemEntity>> = state

    override suspend fun upsert(item: ItemEntity) {
        state.value = state.value.filterNot { it.id == item.id } + item
    }

    override suspend fun markSynced(localId: String, serverId: String, serverUpdatedAt: String) = Unit

    override suspend fun deleteById(localId: String) {
        state.value = state.value.filterNot { it.id == localId }
    }

    override suspend fun clearAll() {
        state.value = emptyList()
    }
}

private class FakePendingOperationDao : PendingOperationDao {
    private val operations = mutableListOf<PendingOperationEntity>()

    override suspend fun pendingOperations(): List<PendingOperationEntity> = operations.toList()

    override suspend fun upsertOperation(operation: PendingOperationEntity) {
        operations.removeAll { it.clientOperationId == operation.clientOperationId }
        operations.add(operation)
    }

    override suspend fun markApplied(clientOperationId: String) = Unit

    override suspend fun markConflict(clientOperationId: String, message: String) = Unit

    override suspend fun clearAll() {
        operations.clear()
    }
}

private class FakeSyncStateDao : SyncStateDao {
    private val states = mutableMapOf<String, String>()

    override suspend fun put(state: SyncStateEntity) {
        states[state.key] = state.value
    }

    override suspend fun get(key: String): String? = states[key]
}
