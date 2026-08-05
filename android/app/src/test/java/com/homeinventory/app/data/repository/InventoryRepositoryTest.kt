package com.homeinventory.app.data.repository

import com.homeinventory.app.core.network.HomeInventoryApi
import com.homeinventory.app.core.network.LoginRequest
import com.homeinventory.app.data.local.ItemDao
import com.homeinventory.app.data.local.ItemEntity
import com.homeinventory.app.data.local.PendingOperationDao
import com.homeinventory.app.data.local.PendingOperationEntity
import com.homeinventory.app.data.remote.ApiEnvelope
import com.homeinventory.app.data.remote.AuthResponse
import com.homeinventory.app.data.remote.MobileSyncRequest
import com.homeinventory.app.data.remote.MobileSyncResponse
import com.homeinventory.app.data.remote.RemoteDashboardDto
import com.homeinventory.app.data.remote.RemoteItemDto
import java.io.IOException
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.flowOf
import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.ResponseBody.Companion.toResponseBody
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
    fun loadSnapshotReturnsDashboardWhenServerSucceeds() = runTest {
        val dashboard = RemoteDashboardDto(
            items = listOf(
                RemoteItemDto(
                    id = "item-1",
                    name = "牛奶",
                    note = "",
                    expireDate = null,
                    locationId = null,
                ),
            ),
        )
        val repository = InventoryRepository(
            api = FakeSnapshotApi(Response.success(ApiEnvelope(ok = true, data = dashboard))),
            itemDao = FakeItemDao(),
            pendingOperationDao = FakePendingOperationDao(),
        )

        val result = repository.loadSnapshot()

        assertTrue(result.isSuccess)
        assertEquals(dashboard, result.getOrNull())
    }

    @Test
    fun loadSnapshotReturnsFailureWithServerMessageWhenResponseFails() = runTest {
        val repository = InventoryRepository(
            api = FakeSnapshotApi(
                Response.error(
                    401,
                    """{"ok":false,"message":"Authentication required"}"""
                        .toResponseBody("application/json".toMediaType()),
                ),
            ),
            itemDao = FakeItemDao(),
            pendingOperationDao = FakePendingOperationDao(),
        )

        val result = repository.loadSnapshot()

        assertTrue(result.isFailure)
        assertEquals("Authentication required", result.exceptionOrNull()?.message)
    }

    @Test
    fun loadSnapshotReturnsFailureWhenNetworkRequestFails() = runTest {
        val repository = InventoryRepository(
            api = FailingSnapshotApi(IOException("timeout")),
            itemDao = FakeItemDao(),
            pendingOperationDao = FakePendingOperationDao(),
        )

        val result = repository.loadSnapshot()

        assertTrue(result.isFailure)
        assertEquals("无法连接服务器，请检查网络", result.exceptionOrNull()?.message)
    }
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

private class FakeItemDao : ItemDao {
    override fun observeAll(): Flow<List<ItemEntity>> = flowOf(emptyList())

    override suspend fun upsert(item: ItemEntity) = Unit

    override suspend fun markSynced(localId: String, serverId: String, serverUpdatedAt: String) = Unit

    override suspend fun deleteById(localId: String) = Unit

    override suspend fun clearAll() = Unit
}

private class FakePendingOperationDao : PendingOperationDao {
    override suspend fun pendingOperations(): List<PendingOperationEntity> = emptyList()

    override suspend fun upsertOperation(operation: PendingOperationEntity) = Unit

    override suspend fun markApplied(clientOperationId: String) = Unit

    override suspend fun markConflict(clientOperationId: String, message: String) = Unit

    override suspend fun clearAll() = Unit
}
