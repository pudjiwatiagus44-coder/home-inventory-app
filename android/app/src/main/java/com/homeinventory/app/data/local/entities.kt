package com.homeinventory.app.data.local

import androidx.room.Entity
import androidx.room.PrimaryKey

object SyncStatus {
    const val Synced = "synced"
    const val PendingCreate = "pending_create"
    const val Conflict = "conflict"
}

@Entity(tableName = "items")
data class InventoryItemEntity(
    @PrimaryKey val localId: String,
    val serverId: String?,
    val name: String,
    val note: String,
    val expireDate: String?,
    val locationId: String?,
    val serverUpdatedAt: String?,
    val localUpdatedAt: Long,
    val syncStatus: String,
) {
    companion object {
        fun pendingCreate(
            localId: String,
            name: String,
            note: String,
            expireDate: String?,
            locationId: String?,
            nowMillis: Long = System.currentTimeMillis(),
        ) = InventoryItemEntity(
            localId = localId,
            serverId = null,
            name = name,
            note = note,
            expireDate = expireDate,
            locationId = locationId,
            serverUpdatedAt = null,
            localUpdatedAt = nowMillis,
            syncStatus = SyncStatus.PendingCreate,
        )
    }
}

@Entity(tableName = "pending_operations")
data class PendingOperationEntity(
    @PrimaryKey val clientOperationId: String,
    val entity: String,
    val action: String,
    val localId: String,
    val serverId: String?,
    val baseServerUpdatedAt: String?,
    val payloadJson: String,
    val state: String,
    val createdAt: Long,
    val errorMessage: String?,
)
