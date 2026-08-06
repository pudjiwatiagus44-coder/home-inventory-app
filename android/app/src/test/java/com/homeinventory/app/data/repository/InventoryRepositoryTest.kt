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
import com.homeinventory.app.data.remote.ApkVersionDto
import com.homeinventory.app.data.remote.CreateInvitationRequest
import com.homeinventory.app.data.remote.InvitationLinkDto
import com.homeinventory.app.data.remote.JoinRequestDto
import com.homeinventory.app.data.remote.RemoteAreaDto
import com.homeinventory.app.data.remote.RemoteDashboardDto
import com.homeinventory.app.data.remote.RemoteHouseholdDto
import com.homeinventory.app.data.remote.RemoteItemDto
import com.homeinventory.app.data.remote.RemoteLocationDto
import com.homeinventory.app.data.remote.ItemCreateRequest
import com.homeinventory.app.data.remote.ItemUpdateRequest
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

    @Test
    fun offlineCreateItemWritesRoomAndQueuesOperation() = runTest {
        val repository = repositoryWith(
            api = FakeSnapshotApi(Response.success(ApiEnvelope(ok = true, data = RemoteDashboardDto()))),
        )

        val created = repository.createItemOffline(
            name = "离线牛奶",
            note = "",
            expireDate = null,
            locationId = null,
        )

        assertEquals("pending_create", created.syncStatus)
        assertEquals(1, repository.observeInventory().first().items.size)
        assertEquals(1, repository.pendingOperations().size)
        assertEquals("item", repository.pendingOperations().single().entity)
        assertEquals("create", repository.pendingOperations().single().action)
    }

    @Test
    fun onlineCreateItemCallsApiAndWritesRoom() = runTest {
        val api = RecordingApi()
        val repository = repositoryWith(api = api)

        val result = repository.createItemOnline(
            name = "牛奶",
            note = "",
            expireDate = "2026-08-29T16:00:00.000Z",
            locationId = "location-1",
        )

        assertTrue(result.isSuccess)
        assertEquals(1, api.createdItems)
        val item = repository.observeInventory().first().items.single()
        assertEquals("synced", item.syncStatus)
        assertEquals("牛奶", item.name)
        assertEquals(10, item.expireDate?.length)
        assertEquals("2026-08-29T16:00:00.000Z" != item.expireDate, true)
    }

    @Test
    fun createInvitationLinkReturnsSharedUrlAfterSnapshotLoaded() = runTest {
        val repository = repositoryWith(
            api = FakeSnapshotApi(
                Response.success(
                    ApiEnvelope(
                        ok = true,
                        data = RemoteDashboardDto(
                            household = RemoteHouseholdDto(id = "household-1", name = "我的家"),
                        ),
                    ),
                ),
            ),
        )
        repository.refreshSnapshot()

        val result = repository.createInvitationLink()

        assertTrue(result.isSuccess)
        assertEquals("https://homestorag.xyz/join/token_1", result.getOrNull())
    }

    @Test
    fun createInvitationLinkFailsWhenHouseholdNotLoaded() = runTest {
        val repository = repositoryWith(
            api = FakeSnapshotApi(Response.success(ApiEnvelope(ok = true, data = RemoteDashboardDto()))),
        )

        val result = repository.createInvitationLink()

        assertTrue(result.isFailure)
        assertEquals("家庭信息未加载，请先刷新清单", result.exceptionOrNull()?.message)
    }

    @Test
    fun createInvitationLinkFailsWhenServerRejects() = runTest {
        val repository = repositoryWith(api = RejectingInvitationApi())
        repository.refreshSnapshot()

        val result = repository.createInvitationLink()

        assertTrue(result.isFailure)
        assertEquals("只有房主可以管理成员和邀请", result.exceptionOrNull()?.message)
    }

    @Test
    fun listJoinRequestsReturnsPendingRequests() = runTest {
        val repository = repositoryWith(
            api = RequestsApi(
                listOf(
                    JoinRequestDto(
                        id = "request-1",
                        userId = "user-2",
                        email = "b@example.com",
                        status = "pending",
                        createdAt = "2026-08-06T00:00:00.000Z",
                    ),
                ),
            ),
        )
        repository.refreshSnapshot()

        val result = repository.listJoinRequests()

        assertTrue(result.isSuccess)
        assertEquals(1, result.getOrNull()?.size)
        assertEquals("b@example.com", result.getOrNull()?.single()?.email)
    }

    @Test
    fun listJoinRequestsFailsWhenHouseholdNotLoaded() = runTest {
        val repository = repositoryWith(
            api = FakeSnapshotApi(Response.success(ApiEnvelope(ok = true, data = RemoteDashboardDto()))),
        )

        val result = repository.listJoinRequests()

        assertTrue(result.isFailure)
        assertEquals("家庭信息未加载，请先刷新清单", result.exceptionOrNull()?.message)
    }

    @Test
    fun approveJoinRequestFailsWhenServerRejects() = runTest {
        val repository = repositoryWith(api = RejectingApprovalApi())
        repository.refreshSnapshot()

        val result = repository.approveJoinRequest("request-1")

        assertTrue(result.isFailure)
        assertEquals("只有房主可以管理成员和邀请", result.exceptionOrNull()?.message)
    }

    @Test
    fun checkForUpdateReturnsServerVersion() = runTest {
        val repository = repositoryWith(
            api = VersionApi(
                ApkVersionDto(
                    versionName = "0.4.0",
                    versionCode = 5,
                    url = "https://homestorag.xyz/apk/home-inventory-internal-latest.apk",
                ),
            ),
        )

        val result = repository.checkForUpdate()

        assertTrue(result.isSuccess)
        assertEquals(5, result.getOrNull()?.versionCode)
        assertEquals("0.4.0", result.getOrNull()?.versionName)
    }

    @Test
    fun checkForUpdateFailsWhenServerUnavailable() = runTest {
        val repository = repositoryWith(api = FailingVersionApi(IOException("timeout")))

        val result = repository.checkForUpdate()

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

private class RequestsApi(
    private val requests: List<JoinRequestDto>,
) : TestApiStub() {
    override suspend fun snapshot(): Response<ApiEnvelope<RemoteDashboardDto>> =
        Response.success(
            ApiEnvelope(
                ok = true,
                data = RemoteDashboardDto(
                    household = RemoteHouseholdDto(id = "household-1", name = "我的家"),
                ),
            ),
        )

    override suspend fun joinRequests(householdId: String): Response<ApiEnvelope<List<JoinRequestDto>>> =
        Response.success(ApiEnvelope(ok = true, data = requests))
}

private class RejectingApprovalApi : TestApiStub() {
    override suspend fun snapshot(): Response<ApiEnvelope<RemoteDashboardDto>> =
        Response.success(
            ApiEnvelope(
                ok = true,
                data = RemoteDashboardDto(
                    household = RemoteHouseholdDto(id = "household-1", name = "我的家"),
                ),
            ),
        )

    override suspend fun approveJoinRequest(requestId: String): Response<ApiEnvelope<Unit>> =
        Response.error(
            403,
            """{"ok":false,"message":"只有房主可以管理成员和邀请"}"""
                .toResponseBody("application/json".toMediaType()),
        )
}

private class VersionApi(
    private val version: ApkVersionDto,
) : TestApiStub() {
    override suspend fun apkVersion(): Response<ApkVersionDto> =
        Response.success(version)
}

private class FailingVersionApi(
    private val error: Throwable,
) : TestApiStub() {
    override suspend fun apkVersion(): Response<ApkVersionDto> {
        throw error
    }
}

private class RecordingApi : TestApiStub() {
    var createdItems = 0

    override suspend fun createItem(request: ItemCreateRequest): Response<ApiEnvelope<RemoteItemDto>> {
        createdItems += 1
        return Response.success(
            ApiEnvelope(
                ok = true,
                data = RemoteItemDto(
                    id = "server-item-1",
                    name = request.name,
                    note = request.note,
                    expireDate = request.expireDate,
                    locationId = request.locationId,
                    updatedAt = "2026-08-05T00:00:00.000Z",
                ),
            ),
        )
    }
}

private class RejectingInvitationApi : TestApiStub() {
    override suspend fun snapshot(): Response<ApiEnvelope<RemoteDashboardDto>> =
        Response.success(
            ApiEnvelope(
                ok = true,
                data = RemoteDashboardDto(
                    household = RemoteHouseholdDto(id = "household-1", name = "我的家"),
                ),
            ),
        )

    override suspend fun createInvitation(request: CreateInvitationRequest): Response<ApiEnvelope<InvitationLinkDto>> =
        Response.error(
            403,
            """{"ok":false,"message":"只有房主可以管理成员和邀请"}"""
                .toResponseBody("application/json".toMediaType()),
        )
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
