package com.homeinventory.app.data.remote

import com.google.gson.annotations.SerializedName
import com.google.gson.JsonObject

data class ApiEnvelope<T>(
    val ok: Boolean,
    val data: T? = null,
    val message: String? = null,
)

data class AuthResponse(
    val ok: Boolean,
    val userId: String? = null,
    val message: String? = null,
)

data class RemoteDashboardDto(
    val household: RemoteHouseholdDto? = null,
    val areas: List<RemoteAreaDto> = emptyList(),
    val locations: List<RemoteLocationDto> = emptyList(),
    val items: List<RemoteItemDto> = emptyList(),
)

data class RemoteHouseholdDto(
    val id: String,
    val name: String,
)

data class RemoteAreaDto(
    val id: String,
    val name: String,
    val color: String,
    val updatedAt: String? = null,
)

data class RemoteLocationDto(
    val id: String,
    val name: String,
    @SerializedName("area_id")
    val areaId: String? = null,
    val updatedAt: String? = null,
)

data class RemoteItemDto(
    val id: String,
    val name: String,
    val note: String,
    @SerializedName("expire_date")
    val expireDate: String? = null,
    @SerializedName("location_id")
    val locationId: String? = null,
    val updatedAt: String? = null,
)

data class MobileSyncRequest(
    val operations: List<MobileSyncOperationDto>,
)

data class MobileSyncOperationDto(
    val clientOperationId: String,
    val entity: String,
    val action: String,
    val localId: String? = null,
    val serverId: String? = null,
    val baseServerUpdatedAt: String? = null,
    val payload: JsonObject? = null,
)

data class MobileSyncResponse(
    val results: List<MobileSyncResultDto> = emptyList(),
)

data class MobileSyncResultDto(
    val clientOperationId: String,
    val status: String,
    val entity: String,
    val localId: String? = null,
    val serverId: String? = null,
    val serverUpdatedAt: String? = null,
    val message: String? = null,
)
