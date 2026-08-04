package com.homeinventory.app.data.repository

import com.google.gson.Gson
import com.homeinventory.app.data.local.InventoryDao
import com.homeinventory.app.data.local.InventoryItemEntity
import com.homeinventory.app.data.local.PendingOperationDao
import com.homeinventory.app.data.local.PendingOperationEntity
import java.util.UUID

class InventoryRepository(
    private val inventoryDao: InventoryDao,
    private val pendingOperationDao: PendingOperationDao,
    private val gson: Gson = Gson(),
) {
    suspend fun createItemOffline(
        name: String,
        note: String = "",
        expireDate: String? = null,
        locationId: String? = null,
        nowMillis: Long = System.currentTimeMillis(),
    ): InventoryItemEntity {
        val localId = "local-item-${UUID.randomUUID()}"
        val item = InventoryItemEntity.pendingCreate(
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

        inventoryDao.upsertItem(item)
        pendingOperationDao.upsertOperation(operation)

        return item
    }
}
