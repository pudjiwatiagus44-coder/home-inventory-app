package com.homeinventory.app.ui.inventory

import com.homeinventory.app.data.remote.RemoteAreaDto
import com.homeinventory.app.data.remote.RemoteDashboardDto
import com.homeinventory.app.data.remote.RemoteHouseholdDto
import com.homeinventory.app.data.remote.RemoteItemDto
import com.homeinventory.app.data.remote.RemoteLocationDto
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.advanceUntilIdle
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.runTest
import kotlinx.coroutines.test.setMain
import kotlinx.coroutines.test.StandardTestDispatcher
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

@OptIn(ExperimentalCoroutinesApi::class)
class InventoryViewModelTest {

    @Test
    fun initialStateHasNoSampleItems() {
        val viewModel = InventoryViewModel(loadSnapshot = { Result.success(RemoteDashboardDto()) })

        assertTrue(viewModel.state.value.items.isEmpty())
        assertNull(viewModel.state.value.syncMessage)
        assertNull(viewModel.state.value.errorMessage)
    }

    @Test
    fun loadFromServerShowsRemoteItemsWithLocationNames() = runTest {
        val dashboard = RemoteDashboardDto(
            household = RemoteHouseholdDto(id = "household-1", name = "我的家"),
            areas = listOf(RemoteAreaDto(id = "area-1", name = "厨房", color = "#ff0000")),
            locations = listOf(RemoteLocationDto(id = "location-1", name = "冰箱", areaId = "area-1")),
            items = listOf(
                RemoteItemDto(
                    id = "item-1",
                    name = "牛奶",
                    note = "记得喝",
                    expireDate = "2026-08-10",
                    locationId = "location-1",
                ),
                RemoteItemDto(
                    id = "item-2",
                    name = "纸巾",
                    note = "",
                    expireDate = null,
                    locationId = null,
                ),
            ),
        )
        val viewModel = InventoryViewModel(loadSnapshot = { Result.success(dashboard) })

        viewModel.loadFromServer()

        val state = viewModel.state.value
        assertFalse(state.isLoading)
        assertNull(state.errorMessage)
        assertEquals("我的家", state.householdName)
        assertEquals(2, state.items.size)
        assertEquals("牛奶", state.items[0].name)
        assertEquals("冰箱", state.items[0].locationName)
        assertEquals("synced", state.items[0].syncStatus)
        assertEquals("纸巾", state.items[1].name)
        assertNull(state.items[1].locationName)
    }

    @Test
    fun loadFromServerShowsEmptyStateWhenNoItems() = runTest {
        val viewModel = InventoryViewModel(loadSnapshot = { Result.success(RemoteDashboardDto()) })

        viewModel.loadFromServer()

        assertTrue(viewModel.state.value.items.isEmpty())
        assertEquals("清单为空", viewModel.state.value.syncMessage)
    }

    @Test
    fun loadFromServerShowsErrorAndKeepsEmptyListWhenServerFails() = runTest {
        val viewModel = InventoryViewModel(
            loadSnapshot = {
                Result.failure(IllegalStateException("Authentication required"))
            },
        )

        viewModel.loadFromServer()

        val state = viewModel.state.value
        assertTrue(state.items.isEmpty())
        assertEquals("Authentication required", state.errorMessage)
        assertFalse(state.isLoading)
    }

    @Test
    fun refreshFromServerLoadsRemoteItems() = runTest {
        Dispatchers.setMain(StandardTestDispatcher(testScheduler))
        try {
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
            val viewModel = InventoryViewModel(loadSnapshot = { Result.success(dashboard) })

            viewModel.refreshFromServer()
            advanceUntilIdle()

            assertEquals(1, viewModel.state.value.items.size)
            assertEquals("牛奶", viewModel.state.value.items[0].name)
        } finally {
            Dispatchers.resetMain()
        }
    }
}
