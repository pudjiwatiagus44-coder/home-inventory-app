package com.homeinventory.app.data.repository

import com.homeinventory.app.data.local.InventoryItemEntity
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class InventoryRepositoryTest {
    @Test
    fun offlineCreatedItemIsMarkedPendingCreate() {
        val item = InventoryItemEntity.pendingCreate(
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
}
