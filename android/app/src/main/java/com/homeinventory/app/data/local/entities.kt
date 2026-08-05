package com.homeinventory.app.data.local

import androidx.room.Entity
import androidx.room.PrimaryKey

object SyncStatus {
    const val Synced = "synced"
    const val PendingCreate = "pending_create"
    const val PendingUpdate = "pending_update"
    const val PendingDelete = "pending_delete"
    const val Conflict = "conflict"
}

@Entity(tableName = "areas")
data class AreaEntity(
    @PrimaryKey val id: String,
    val serverId: String?,
    val name: String,
    val color: String,
    val serverUpdatedAt: String?,
    val localUpdatedAt: Long,
    val syncStatus: String,
)

@Entity(tableName = "locations")
data class LocationEntity(
    @PrimaryKey val id: String,
    val serverId: String?,
    val areaId: String?,
    val name: String,
    val serverUpdatedAt: String?,
    val localUpdatedAt: Long,
    val syncStatus: String,
)

@Entity(tableName = "items")
data class ItemEntity(
    @PrimaryKey val id: String,
    val serverId: String?,
    val locationId: String?,
    val name: String,
    val note: String,
    val expireDate: String?,
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
        ) = ItemEntity(
            id = localId,
            serverId = null,
            locationId = locationId,
            name = name,
            note = note,
            expireDate = expireDate,
            serverUpdatedAt = null,
            localUpdatedAt = nowMillis,
            syncStatus = SyncStatus.PendingCreate,
        )
    }
}

@Entity(tableName = "sync_state")
data class SyncStateEntity(
    @PrimaryKey val key: String,
    val value: String,
)

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
