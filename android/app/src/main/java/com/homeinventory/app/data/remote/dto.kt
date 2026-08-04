package com.homeinventory.app.data.remote

import com.google.gson.annotations.SerializedName

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
