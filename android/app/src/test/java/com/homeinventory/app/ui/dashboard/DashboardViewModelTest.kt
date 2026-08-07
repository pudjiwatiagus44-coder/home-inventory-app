package com.homeinventory.app.ui.dashboard

import com.homeinventory.app.data.repository.InventorySnapshot
import com.homeinventory.app.data.repository.RecognitionDraft
import com.homeinventory.app.data.repository.DraftGateway
import com.homeinventory.app.data.remote.ApkVersionDto
import com.homeinventory.app.data.remote.JoinRequestDto
import com.homeinventory.app.data.local.DraftEntity
import com.homeinventory.app.data.local.DraftStatus
import com.homeinventory.app.ui.dashboard.dialogs.ItemFormValues
import java.time.LocalDate
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.test.StandardTestDispatcher
import kotlinx.coroutines.test.advanceUntilIdle
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.runTest
import kotlinx.coroutines.test.setMain
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

@OptIn(ExperimentalCoroutinesApi::class)
class DashboardViewModelTest {
    @Test
    fun filtersItemsByArea() = runTest {
        Dispatchers.setMain(StandardTestDispatcher(testScheduler))
        try {
            val snapshot = InventorySnapshot(
                items = listOf(
                    item("item-1", "牛奶", areaId = "area-1", locationId = "location-1"),
                    item("item-2", "纸巾", areaId = "area-2", locationId = "location-2"),
                ),
            )
            val viewModel = DashboardViewModel(
                inventory = MutableStateFlow(snapshot),
                syncPending = { Result.success(Unit) },
            )
            advanceUntilIdle()

            viewModel.selectArea("area-1")
            advanceUntilIdle()

            assertEquals(listOf("牛奶"), viewModel.state.value.visibleItems.map { it.name })
        } finally {
            Dispatchers.resetMain()
        }
    }

    @Test
    fun sortsItemsByExpireSoonFirst() = runTest {
        Dispatchers.setMain(StandardTestDispatcher(testScheduler))
        try {
            val snapshot = InventorySnapshot(
                items = listOf(
                    item("item-1", "牛奶", expireDate = "2026-08-20"),
                    item("item-2", "药品", expireDate = "2026-08-10"),
                ),
            )
            val viewModel = DashboardViewModel(
                inventory = MutableStateFlow(snapshot),
                syncPending = { Result.success(Unit) },
            )
            advanceUntilIdle()

            viewModel.sortByExpireSoon()
            advanceUntilIdle()

            assertEquals(listOf("药品", "牛奶"), viewModel.state.value.visibleItems.map { it.name })
        } finally {
            Dispatchers.resetMain()
        }
    }

    @Test
    fun marksExpiredAndSoonItems() = runTest {
        Dispatchers.setMain(StandardTestDispatcher(testScheduler))
        try {
            val today = LocalDate.parse("2026-08-05")
            val snapshot = InventorySnapshot(
                items = listOf(
                    item("item-1", "过期药", expireDate = "2026-08-01"),
                    item("item-2", "将过期奶", expireDate = "2026-08-20"),
                    item("item-3", "正常品", expireDate = "2026-12-01"),
                ),
            )
            val viewModel = DashboardViewModel(
                inventory = MutableStateFlow(snapshot),
                syncPending = { Result.success(Unit) },
                today = today,
            )
            advanceUntilIdle()

            val statuses = viewModel.state.value.visibleItems.associate { it.name to it.expirationStatus }
            assertEquals("expired", statuses["过期药"])
            assertEquals("soon", statuses["将过期奶"])
            assertEquals("normal", statuses["正常品"])
        } finally {
            Dispatchers.resetMain()
        }
    }

    @Test
    fun searchMatchesNameAndLocation() = runTest {
        Dispatchers.setMain(StandardTestDispatcher(testScheduler))
        try {
            val snapshot = InventorySnapshot(
                locations = listOf(
                    InventorySnapshot.LocationView(
                        id = "location-1",
                        name = "冰箱",
                        areaId = "area-1",
                        syncStatus = "synced",
                    ),
                ),
                items = listOf(
                    item("item-1", "牛奶", locationId = "location-1", locationName = "冰箱"),
                    item("item-2", "纸巾", locationId = null, locationName = null),
                ),
            )
            val viewModel = DashboardViewModel(
                inventory = MutableStateFlow(snapshot),
                syncPending = { Result.success(Unit) },
            )
            advanceUntilIdle()

            viewModel.updateSearch("冰箱")
            advanceUntilIdle()

            assertEquals(listOf("牛奶"), viewModel.state.value.visibleItems.map { it.name })
        } finally {
            Dispatchers.resetMain()
        }
    }

    @Test
    fun generateInvitationLinkExposesSharedUrl() = runTest {
        Dispatchers.setMain(StandardTestDispatcher(testScheduler))
        try {
            val viewModel = DashboardViewModel(
                inventory = MutableStateFlow(InventorySnapshot()),
                syncPending = { Result.success(Unit) },
                createInvitation = { Result.success("https://homestorag.xyz/join/abc") },
            )
            advanceUntilIdle()

            viewModel.generateInvitationLink()
            advanceUntilIdle()

            assertEquals("https://homestorag.xyz/join/abc", viewModel.invitations().value.link)
            assertEquals(false, viewModel.invitations().value.isGenerating)
            assertEquals(null, viewModel.invitations().value.errorMessage)
        } finally {
            Dispatchers.resetMain()
        }
    }

    @Test
    fun generateInvitationLinkShowsErrorWhenGenerationFails() = runTest {
        Dispatchers.setMain(StandardTestDispatcher(testScheduler))
        try {
            val viewModel = DashboardViewModel(
                inventory = MutableStateFlow(InventorySnapshot()),
                syncPending = { Result.success(Unit) },
                createInvitation = {
                    Result.failure(IllegalStateException("只有房主可以管理成员和邀请"))
                },
            )
            advanceUntilIdle()

            viewModel.generateInvitationLink()
            advanceUntilIdle()

            assertEquals(null, viewModel.invitations().value.link)
            assertEquals("只有房主可以管理成员和邀请", viewModel.invitations().value.errorMessage)
        } finally {
            Dispatchers.resetMain()
        }
    }

    @Test
    fun refreshJoinRequestsShowsPendingApplications() = runTest {
        Dispatchers.setMain(StandardTestDispatcher(testScheduler))
        try {
            val viewModel = DashboardViewModel(
                inventory = MutableStateFlow(InventorySnapshot()),
                syncPending = { Result.success(Unit) },
                loadJoinRequests = {
                    Result.success(
                        listOf(
                            JoinRequestDto(
                                id = "request-1",
                                userId = "user-2",
                                email = "b@example.com",
                                status = "pending",
                            ),
                        ),
                    )
                },
            )
            advanceUntilIdle()

            viewModel.refreshJoinRequests()
            advanceUntilIdle()

            assertEquals(1, viewModel.joinRequestsState().value.requests.size)
            assertEquals("b@example.com", viewModel.joinRequestsState().value.requests.single().email)
        } finally {
            Dispatchers.resetMain()
        }
    }

    @Test
    fun approveJoinRequestRemovesRequestAfterSuccess() = runTest {
        Dispatchers.setMain(StandardTestDispatcher(testScheduler))
        try {
            var approved = false
            val viewModel = DashboardViewModel(
                inventory = MutableStateFlow(InventorySnapshot()),
                syncPending = { Result.success(Unit) },
                loadJoinRequests = {
                    Result.success(
                        if (approved) {
                            emptyList()
                        } else {
                            listOf(
                                JoinRequestDto(
                                    id = "request-1",
                                    userId = "user-2",
                                    email = "b@example.com",
                                    status = "pending",
                                ),
                            )
                        },
                    )
                },
                approveJoinRequest = { requestId ->
                    approved = true
                    Result.success(Unit)
                },
            )
            advanceUntilIdle()

            viewModel.refreshJoinRequests()
            advanceUntilIdle()
            viewModel.approveRequest("request-1")
            advanceUntilIdle()

            assertEquals(0, viewModel.joinRequestsState().value.requests.size)
        } finally {
            Dispatchers.resetMain()
        }
    }

    @Test
    fun rejectJoinRequestShowsErrorWhenFails() = runTest {
        Dispatchers.setMain(StandardTestDispatcher(testScheduler))
        try {
            val viewModel = DashboardViewModel(
                inventory = MutableStateFlow(InventorySnapshot()),
                syncPending = { Result.success(Unit) },
                loadJoinRequests = {
                    Result.success(
                        listOf(
                            JoinRequestDto(
                                id = "request-1",
                                userId = "user-2",
                                email = "b@example.com",
                                status = "pending",
                            ),
                        ),
                    )
                },
                rejectJoinRequest = {
                    Result.failure(IllegalStateException("只有房主可以管理成员和邀请"))
                },
            )
            advanceUntilIdle()

            viewModel.refreshJoinRequests()
            advanceUntilIdle()
            viewModel.rejectRequest("request-1")
            advanceUntilIdle()

            assertEquals("只有房主可以管理成员和邀请", viewModel.joinRequestsState().value.errorMessage)
            assertEquals(1, viewModel.joinRequestsState().value.requests.size)
        } finally {
            Dispatchers.resetMain()
        }
    }

    @Test
    fun checkForUpdatesPromptsWhenServerVersionIsNewer() = runTest {
        Dispatchers.setMain(StandardTestDispatcher(testScheduler))
        try {
            val viewModel = DashboardViewModel(
                inventory = MutableStateFlow(InventorySnapshot()),
                syncPending = { Result.success(Unit) },
                checkForUpdate = {
                    Result.success(
                        ApkVersionDto(
                            versionName = "0.4.0",
                            versionCode = 5,
                            url = "https://homestorag.xyz/apk/home-inventory-internal-latest.apk",
                        ),
                    )
                },
                localVersionCode = 4,
            )
            advanceUntilIdle()

            viewModel.checkForUpdates()
            advanceUntilIdle()

            assertEquals(true, viewModel.updateCheckState().value.updateAvailable)
            assertEquals("0.4.0", viewModel.updateCheckState().value.versionName)
            assertEquals(
                "https://homestorag.xyz/apk/home-inventory-internal-latest.apk",
                viewModel.updateCheckState().value.downloadUrl,
            )
        } finally {
            Dispatchers.resetMain()
        }
    }

    @Test
    fun checkForUpdatesStaysSilentWhenVersionsMatch() = runTest {
        Dispatchers.setMain(StandardTestDispatcher(testScheduler))
        try {
            val viewModel = DashboardViewModel(
                inventory = MutableStateFlow(InventorySnapshot()),
                syncPending = { Result.success(Unit) },
                checkForUpdate = {
                    Result.success(
                        ApkVersionDto(
                            versionName = "0.4.0",
                            versionCode = 4,
                            url = "https://homestorag.xyz/apk/home-inventory-internal-latest.apk",
                        ),
                    )
                },
                localVersionCode = 4,
            )
            advanceUntilIdle()

            viewModel.checkForUpdates()
            advanceUntilIdle()

            assertEquals(false, viewModel.updateCheckState().value.updateAvailable)
        } finally {
            Dispatchers.resetMain()
        }
    }

    @Test
    fun checkForUpdatesStaysSilentWhenCheckFails() = runTest {
        Dispatchers.setMain(StandardTestDispatcher(testScheduler))
        try {
            val viewModel = DashboardViewModel(
                inventory = MutableStateFlow(InventorySnapshot()),
                syncPending = { Result.success(Unit) },
                checkForUpdate = {
                    Result.failure(IllegalStateException("无法连接服务器，请检查网络"))
                },
                localVersionCode = 4,
            )
            advanceUntilIdle()

            viewModel.checkForUpdates()
            advanceUntilIdle()

            assertEquals(false, viewModel.updateCheckState().value.updateAvailable)
            assertEquals(false, viewModel.updateCheckState().value.isChecking)
        } finally {
            Dispatchers.resetMain()
        }
    }

    @Test
    fun recognizeItemPhotoDelegatesToRepository() = runTest {
        Dispatchers.setMain(StandardTestDispatcher(testScheduler))
        try {
            val viewModel = DashboardViewModel(
                inventory = MutableStateFlow(InventorySnapshot()),
                recognizePhoto = { mode, _ ->
                    Result.success(
                        RecognitionDraft(
                            mode = mode,
                            name = "牛奶",
                            thumbnailId = "photo_1.jpg",
                        ),
                    )
                },
            )
            advanceUntilIdle()

            val result = viewModel.recognizeItemPhoto("name", byteArrayOf(1))

            assertTrue(result.isSuccess)
            assertEquals("牛奶", result.getOrNull()?.name)
            assertEquals("photo_1.jpg", result.getOrNull()?.thumbnailId)
        } finally {
            Dispatchers.resetMain()
        }
    }

    @Test
    fun recognizeItemPhotoSurfacesFailure() = runTest {
        Dispatchers.setMain(StandardTestDispatcher(testScheduler))
        try {
            val viewModel = DashboardViewModel(
                inventory = MutableStateFlow(InventorySnapshot()),
                recognizePhoto = { _, _ ->
                    Result.failure(IllegalStateException("识别失败"))
                },
            )
            advanceUntilIdle()

            val result = viewModel.recognizeItemPhoto("name", byteArrayOf(1))

            assertTrue(result.isFailure)
            assertEquals("识别失败", result.exceptionOrNull()?.message)
        } finally {
            Dispatchers.resetMain()
        }
    }

    @Test
    fun saveToDraftCreatesDraftAndRunsBackgroundRecognition() = runTest {
        Dispatchers.setMain(StandardTestDispatcher(testScheduler))
        try {
            var recognized = false
            val gateway = FakeDraftGateway(onRecognize = { _ -> recognized = true })
            val viewModel = DashboardViewModel(
                inventory = MutableStateFlow(InventorySnapshot()),
                draftGateway = gateway,
            )
            advanceUntilIdle()

            viewModel.saveToDraft(
                DraftSaveInput(
                    bytes = byteArrayOf(1),
                    name = "",
                    note = "",
                    expireDate = null,
                    areaId = null,
                    locationId = null,
                    photoKey = null,
                ),
            )
            advanceUntilIdle()

            assertTrue(recognized)
            assertEquals(1, gateway.created.size)
            assertEquals(DraftStatus.Recognizing, gateway.created[0].status)
        } finally {
            Dispatchers.resetMain()
        }
    }

    @Test
    fun confirmSaveDraftCreatesItemAndDeletesDraft() = runTest {
        Dispatchers.setMain(StandardTestDispatcher(testScheduler))
        try {
            var created = false
            val gateway = FakeDraftGateway()
            val viewModel = DashboardViewModel(
                inventory = MutableStateFlow(InventorySnapshot()),
                draftGateway = gateway,
                confirmDraftCreate = { _, _, _, _, _ ->
                    created = true
                    Result.success(Unit)
                },
            )
            advanceUntilIdle()

            viewModel.saveToDraft(
                DraftSaveInput(
                    bytes = null,
                    name = "牛奶",
                    note = "常温保存",
                    expireDate = null,
                    areaId = null,
                    locationId = null,
                    photoKey = "photo_1.jpg",
                ),
            )
            advanceUntilIdle()
            val draft = gateway.created[0]

            viewModel.confirmSaveDraft(
                draft.id,
                ItemFormValues(
                    name = "牛奶",
                    areaId = "",
                    locationId = "",
                    note = "常温保存",
                    expireDate = null,
                    photoKey = "photo_1.jpg",
                ),
            )
            advanceUntilIdle()

            assertTrue(created)
            assertEquals(listOf(draft.id), gateway.deleted)
        } finally {
            Dispatchers.resetMain()
        }
    }

    @Test
    fun draftsStateExposesDraftList() = runTest {
        Dispatchers.setMain(StandardTestDispatcher(testScheduler))
        try {
            val gateway = FakeDraftGateway()
            val viewModel = DashboardViewModel(
                inventory = MutableStateFlow(InventorySnapshot()),
                draftGateway = gateway,
            )
            advanceUntilIdle()

            viewModel.saveToDraft(
                DraftSaveInput(
                    bytes = null,
                    name = "x",
                    note = "",
                    expireDate = null,
                    areaId = null,
                    locationId = null,
                    photoKey = "p.jpg",
                ),
            )
            advanceUntilIdle()

            assertEquals(1, viewModel.draftsState.value.drafts.size)
        } finally {
            Dispatchers.resetMain()
        }
    }

    @Test
    fun batchImportToDraftsCreatesDraftsAndRecognizes() = runTest {
        Dispatchers.setMain(StandardTestDispatcher(testScheduler))
        try {
            var recognized = 0
            val gateway = FakeDraftGateway(onRecognize = { _ -> recognized += 1 })
            val viewModel = DashboardViewModel(
                inventory = MutableStateFlow(InventorySnapshot()),
                draftGateway = gateway,
            )
            advanceUntilIdle()

            viewModel.batchImportToDrafts(
                "area-1",
                "location-1",
                listOf(byteArrayOf(1), byteArrayOf(2)),
            )
            advanceUntilIdle()

            assertEquals(2, gateway.created.size)
            assertEquals(2, recognized)
            assertEquals("area-1", gateway.created[0].areaId)
            assertEquals("location-1", gateway.created[0].locationId)
        } finally {
            Dispatchers.resetMain()
        }
    }

    @Test
    fun resumePendingRecognitionsRetriesBlankNameDrafts() = runTest {
        Dispatchers.setMain(StandardTestDispatcher(testScheduler))
        try {
            var recognized = 0
            val gateway = FakeDraftGateway(
                fillName = false,
                onRecognize = { _ -> recognized += 1 },
            )
            val viewModel = DashboardViewModel(
                inventory = MutableStateFlow(InventorySnapshot()),
                draftGateway = gateway,
            )
            advanceUntilIdle()

            viewModel.saveToDraft(
                DraftSaveInput(
                    bytes = byteArrayOf(1),
                    name = "",
                    note = "",
                    expireDate = null,
                    areaId = null,
                    locationId = null,
                    photoKey = null,
                ),
            )
            advanceUntilIdle()
            val before = recognized
            assertTrue(before >= 1)

            viewModel.resumePendingRecognitions()
            advanceUntilIdle()

            assertTrue(recognized > before)
        } finally {
            Dispatchers.resetMain()
        }
    }

    @Test
    fun unassignedFilterShowsOnlyLocationlessItems() = runTest {
        Dispatchers.setMain(StandardTestDispatcher(testScheduler))
        try {
            val snapshot = InventorySnapshot(
                items = listOf(
                    item("item-1", "牛奶", areaId = "area-1", locationId = "location-1"),
                    item("item-2", "散件", areaId = null, locationId = null),
                ),
            )
            val viewModel = DashboardViewModel(
                inventory = MutableStateFlow(snapshot),
                syncPending = { Result.success(Unit) },
            )
            advanceUntilIdle()

            viewModel.toggleUnassignedFilter()
            advanceUntilIdle()

            assertEquals(listOf("散件"), viewModel.state.value.visibleItems.map { it.name })
            assertEquals(true, viewModel.state.value.unassignedFilter)
        } finally {
            Dispatchers.resetMain()
        }
    }

    private fun item(
        id: String,
        name: String,
        expireDate: String? = null,
        areaId: String? = null,
        locationId: String? = null,
        locationName: String? = null,
    ) = InventorySnapshot.ItemView(
        id = id,
        name = name,
        note = "",
        expireDate = expireDate,
        locationId = locationId,
        areaId = areaId,
        locationName = locationName,
        syncStatus = "synced",
    )
}

private class FakeDraftGateway(
    private val onRecognize: suspend (String) -> Unit = { _ -> },
    private val fillName: Boolean = true,
) : DraftGateway {
    val created = mutableListOf<DraftEntity>()
    val deleted = mutableListOf<String>()
    private val flow = MutableStateFlow<List<DraftEntity>>(emptyList())

    override fun observe(): kotlinx.coroutines.flow.Flow<List<DraftEntity>> = flow

    override suspend fun create(
        bytes: ByteArray?,
        name: String,
        note: String,
        expireDate: String?,
        areaId: String?,
        locationId: String?,
        photoKey: String?,
    ): DraftEntity {
        val draft = DraftEntity(
            id = "draft-${created.size + 1}",
            photoKey = photoKey,
            name = name,
            note = note,
            expireDate = expireDate,
            areaId = areaId,
            locationId = locationId,
            status = if (name.isNotBlank() && photoKey != null) {
                DraftStatus.Ready
            } else {
                DraftStatus.Recognizing
            },
            createdAt = System.currentTimeMillis(),
        )
        created.add(draft)
        flow.value = flow.value + draft
        return draft
    }

    override suspend fun recognize(id: String): DraftEntity? {
        onRecognize(id)
        flow.value = flow.value.map {
            if (it.id == id) {
                it.copy(
                    status = DraftStatus.Ready,
                    name = if (fillName) "牛奶" else it.name,
                )
            } else {
                it
            }
        }
        return flow.value.firstOrNull { it.id == id }
    }

    override suspend fun delete(id: String) {
        deleted.add(id)
        flow.value = flow.value.filterNot { it.id == id }
    }

    override suspend fun deleteAfterConfirm(id: String) {
        deleted.add(id)
        flow.value = flow.value.filterNot { it.id == id }
    }

    override fun readPhoto(id: String, photoKey: String?): android.graphics.Bitmap? = null

    override fun readPhotoLarge(id: String, photoKey: String?): android.graphics.Bitmap? = null
}
