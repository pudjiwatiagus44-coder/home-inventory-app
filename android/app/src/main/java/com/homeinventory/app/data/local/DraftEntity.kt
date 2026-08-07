package com.homeinventory.app.data.local

import androidx.room.Entity
import androidx.room.PrimaryKey

object DraftStatus {
    const val Recognizing = "recognizing"
    const val Ready = "ready"
}

@Entity(tableName = "drafts")
data class DraftEntity(
    @PrimaryKey val id: String,
    val photoKey: String?,
    val name: String,
    val note: String,
    val expireDate: String?,
    val areaId: String?,
    val locationId: String?,
    val status: String,
    val createdAt: Long,
)
