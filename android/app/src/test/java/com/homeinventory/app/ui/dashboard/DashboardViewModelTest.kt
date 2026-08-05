package com.homeinventory.app.ui.dashboard

import com.homeinventory.app.data.repository.InventorySnapshot
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
                    InventorySnapshot.LocationView("location-1", "冰箱", "area-1", "synced"),
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
