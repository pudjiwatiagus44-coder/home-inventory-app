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

data class FeedbackRequest(
    val message: String,
    val source: String,
    val appVersion: String? = null,
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

data class HouseholdDto(
    val id: String,
    val name: String,
    val displayName: String? = null,
    val effectiveName: String? = null,
    val role: String? = null,
)

data class CreateHouseholdRequest(
    val name: String,
)

data class RenameHouseholdRequest(
    val householdId: String,
    val name: String,
)

data class HouseholdDisplayNameRequest(
    val householdId: String,
    val displayName: String,
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
    @SerializedName("photo_key")
    val photoKey: String? = null,
    val updatedAt: String? = null,
)

data class MobileSyncRequest(
    val householdId: String? = null,
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

data class AreaCreateRequest(
    val householdId: String? = null,
    val name: String,
    val color: String? = null,
)

data class AreaUpdateRequest(
    val householdId: String? = null,
    val name: String,
    val color: String? = null,
)

data class LocationCreateRequest(
    val householdId: String? = null,
    val name: String,
    val areaId: String? = null,
)

data class LocationUpdateRequest(
    val householdId: String? = null,
    val name: String,
    val areaId: String? = null,
)

data class ItemCreateRequest(
    val householdId: String? = null,
    val name: String,
    val note: String = "",
    val expireDate: String? = null,
    val locationId: String? = null,
    val photoKey: String? = null,
)

data class ItemUpdateRequest(
    val householdId: String? = null,
    val name: String,
    val note: String = "",
    val expireDate: String? = null,
    val locationId: String? = null,
    val photoKey: String? = null,
)

data class ImportRowDto(
    val index: Int,
    val name: String,
    val locationName: String,
    val areaName: String,
    val note: String,
    val expireDate: String?,
)

data class ImportConflictExistingDto(
    val id: String,
    val name: String,
    val note: String,
    val expireDate: String?,
    val locationName: String,
    val areaName: String,
)

data class ImportConflictDto(
    val id: String,
    val row: ImportRowDto,
    val existingItem: ImportConflictExistingDto,
)

data class ImportSkippedDto(
    val row: Int,
    val reason: String,
)

data class ImportErrorDto(
    val row: Int,
    val message: String,
)

data class ImportCreateDto(
    val row: ImportRowDto? = null,
)

data class ImportPreviewDto(
    val rows: List<ImportRowDto> = emptyList(),
    val creates: List<ImportCreateDto> = emptyList(),
    val skipped: List<ImportSkippedDto> = emptyList(),
    val conflicts: List<ImportConflictDto> = emptyList(),
    val errors: List<ImportErrorDto> = emptyList(),
)

data class ImportCommitRequest(
    val rows: List<ImportRowDto>,
    val conflictResolutions: Map<String, String>,
)

data class ImportSummaryDto(
    val createdAreas: Int = 0,
    val createdLocations: Int = 0,
    val createdItems: Int = 0,
    val keptConflictItems: Int = 0,
    val overwrittenItems: Int = 0,
    val skippedItems: Int = 0,
    val errors: List<ImportErrorDto> = emptyList(),
)

data class CreateInvitationRequest(
    val householdId: String? = null,
    val grants: List<InvitationGrantDto>? = null,
)

data class InvitationGrantDto(
    val householdId: String,
    val role: String,
)

data class InvitationLinkDto(
    val id: String,
    val token: String,
    val expiresAt: String? = null,
    val url: String,
)

data class JoinRequestDto(
    val id: String,
    @SerializedName("user_id")
    val userId: String,
    val email: String,
    val status: String,
    @SerializedName("created_at")
    val createdAt: String? = null,
)

data class MemberDto(
    @SerializedName("user_id")
    val userId: String,
    val email: String,
    val role: String,
    @SerializedName("created_at")
    val createdAt: String? = null,
)

data class UpdateMemberRoleRequest(
    val householdId: String,
    val role: String,
)

data class RemoveMemberRequest(
    val householdId: String,
)

data class ApkVersionDto(
    @SerializedName("versionName")
    val versionName: String? = null,
    @SerializedName("versionCode")
    val versionCode: Int = 0,
    @SerializedName("url")
    val url: String? = null,
    @SerializedName("size")
    val size: Long = 0,
    @SerializedName("updatedAt")
    val updatedAt: String? = null,
)

data class RecognitionResponseDto(
    val mode: String,
    val recognized: Boolean,
    val name: String? = null,
    val note: String? = null,
    val expireDate: String? = null,
    val thumbnailId: String? = null,
)
