package com.homeinventory.app.data.repository

import com.homeinventory.app.core.network.HomeInventoryApi
import com.homeinventory.app.core.network.LoginRequest
import com.homeinventory.app.core.network.RegisterRequest
import com.homeinventory.app.core.network.ForgotPasswordRequest
import com.homeinventory.app.data.remote.ApiEnvelope
import com.homeinventory.app.data.remote.AreaCreateRequest
import com.homeinventory.app.data.remote.AreaUpdateRequest
import com.homeinventory.app.data.remote.ApkVersionDto
import com.homeinventory.app.data.remote.AuthResponse
import com.homeinventory.app.data.remote.CreateInvitationRequest
import com.homeinventory.app.data.remote.ImportCommitRequest
import com.homeinventory.app.data.remote.ImportPreviewDto
import com.homeinventory.app.data.remote.ImportSummaryDto
import com.homeinventory.app.data.remote.InvitationLinkDto
import com.homeinventory.app.data.remote.HouseholdDto
import com.homeinventory.app.data.remote.ItemCreateRequest
import com.homeinventory.app.data.remote.ItemUpdateRequest
import com.homeinventory.app.data.remote.JoinRequestDto
import com.homeinventory.app.data.remote.MemberDto
import com.homeinventory.app.data.remote.LocationCreateRequest
import com.homeinventory.app.data.remote.LocationUpdateRequest
import com.homeinventory.app.data.remote.MobileSyncRequest
import com.homeinventory.app.data.remote.MobileSyncResponse
import com.homeinventory.app.data.remote.PhotoUploadResponseDto
import com.homeinventory.app.data.remote.RemoteAreaDto
import com.homeinventory.app.data.remote.RemoteDashboardDto
import com.homeinventory.app.data.remote.RemoteItemDto
import com.homeinventory.app.data.remote.RemoteLocationDto
import com.homeinventory.app.data.remote.RecognitionResponseDto
import com.homeinventory.app.data.remote.RemoveMemberRequest
import com.homeinventory.app.data.remote.UpdateMemberRoleRequest
import okhttp3.MultipartBody
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.ResponseBody
import okhttp3.ResponseBody.Companion.toResponseBody
import retrofit2.Response

abstract class TestApiStub : HomeInventoryApi {
    override suspend fun login(request: LoginRequest): Response<AuthResponse> =
        Response.success(AuthResponse(ok = true))

    override suspend fun register(request: RegisterRequest): Response<AuthResponse> =
        Response.success(AuthResponse(ok = true))

    override suspend fun forgotPassword(request: ForgotPasswordRequest): Response<ApiEnvelope<Unit>> =
        Response.success(ApiEnvelope(ok = true))

    override suspend fun logout(): Response<ApiEnvelope<Unit>> =
        Response.success(ApiEnvelope(ok = true))

    override suspend fun households(): Response<ApiEnvelope<List<HouseholdDto>>> =
        Response.success(ApiEnvelope(ok = true, data = emptyList()))

    override suspend fun snapshot(
        householdId: String?,
    ): Response<ApiEnvelope<RemoteDashboardDto>> =
        Response.success(ApiEnvelope(ok = true, data = RemoteDashboardDto()))

    override suspend fun syncInventory(request: MobileSyncRequest): Response<ApiEnvelope<MobileSyncResponse>> =
        Response.success(ApiEnvelope(ok = true, data = MobileSyncResponse()))

    override suspend fun createArea(request: AreaCreateRequest): Response<ApiEnvelope<RemoteAreaDto>> =
        Response.success(ApiEnvelope(ok = true, data = RemoteAreaDto(id = "area-1", name = request.name, color = request.color ?: "#000000")))

    override suspend fun updateArea(areaId: String, request: AreaUpdateRequest): Response<ApiEnvelope<RemoteAreaDto>> =
        Response.success(ApiEnvelope(ok = true, data = RemoteAreaDto(id = areaId, name = request.name, color = request.color ?: "#000000")))

    override suspend fun deleteArea(areaId: String): Response<ApiEnvelope<Unit>> =
        Response.success(ApiEnvelope(ok = true))

    override suspend fun createLocation(request: LocationCreateRequest): Response<ApiEnvelope<RemoteLocationDto>> =
        Response.success(ApiEnvelope(ok = true, data = RemoteLocationDto(id = "location-1", name = request.name, areaId = request.areaId)))

    override suspend fun updateLocation(locationId: String, request: LocationUpdateRequest): Response<ApiEnvelope<RemoteLocationDto>> =
        Response.success(ApiEnvelope(ok = true, data = RemoteLocationDto(id = locationId, name = request.name, areaId = request.areaId)))

    override suspend fun deleteLocation(locationId: String): Response<ApiEnvelope<Unit>> =
        Response.success(ApiEnvelope(ok = true))

    override suspend fun createItem(request: ItemCreateRequest): Response<ApiEnvelope<RemoteItemDto>> =
        Response.success(ApiEnvelope(ok = true, data = RemoteItemDto(id = "item-1", name = request.name, note = request.note, expireDate = request.expireDate, locationId = request.locationId)))

    override suspend fun updateItem(itemId: String, request: ItemUpdateRequest): Response<ApiEnvelope<RemoteItemDto>> =
        Response.success(ApiEnvelope(ok = true, data = RemoteItemDto(id = itemId, name = request.name, note = request.note, expireDate = request.expireDate, locationId = request.locationId)))

    override suspend fun deleteItem(itemId: String): Response<ApiEnvelope<Unit>> =
        Response.success(ApiEnvelope(ok = true))

    override suspend fun recognize(
        file: MultipartBody.Part,
        mode: String,
    ): Response<ApiEnvelope<RecognitionResponseDto>> =
        Response.success(
            ApiEnvelope(
                ok = true,
                data = RecognitionResponseDto(
                    mode = mode,
                    recognized = true,
                    name = "牛奶",
                    note = "常温保存",
                    expireDate = null,
                    thumbnailId = "photo_1.jpg",
                ),
            ),
        )

    override suspend fun itemPhoto(itemId: String): Response<ResponseBody> =
        Response.success("not-a-real-jpeg".toResponseBody("image/jpeg".toMediaType()))

    override suspend fun uploadAreaPhoto(
        areaId: String,
        file: MultipartBody.Part,
    ): Response<ApiEnvelope<PhotoUploadResponseDto>> =
        Response.success(ApiEnvelope(ok = true, data = PhotoUploadResponseDto(photoKey = "area_1.jpg")))

    override suspend fun areaPhoto(areaId: String): Response<ResponseBody> =
        Response.success("not-a-real-jpeg".toResponseBody("image/jpeg".toMediaType()))

    override suspend fun deleteAreaPhoto(areaId: String): Response<ApiEnvelope<Unit>> =
        Response.success(ApiEnvelope(ok = true))

    override suspend fun uploadLocationPhoto(
        locationId: String,
        file: MultipartBody.Part,
    ): Response<ApiEnvelope<PhotoUploadResponseDto>> =
        Response.success(ApiEnvelope(ok = true, data = PhotoUploadResponseDto(photoKey = "location_1.jpg")))

    override suspend fun locationPhoto(locationId: String): Response<ResponseBody> =
        Response.success("not-a-real-jpeg".toResponseBody("image/jpeg".toMediaType()))

    override suspend fun deleteLocationPhoto(locationId: String): Response<ApiEnvelope<Unit>> =
        Response.success(ApiEnvelope(ok = true))

    override suspend fun previewImport(file: MultipartBody.Part): Response<ApiEnvelope<ImportPreviewDto>> =
        Response.success(ApiEnvelope(ok = true, data = ImportPreviewDto()))

    override suspend fun commitImport(request: ImportCommitRequest): Response<ApiEnvelope<ImportSummaryDto>> =
        Response.success(ApiEnvelope(ok = true, data = ImportSummaryDto()))

    override suspend fun createInvitation(request: CreateInvitationRequest): Response<ApiEnvelope<InvitationLinkDto>> =
        Response.success(
            ApiEnvelope(
                ok = true,
                data = InvitationLinkDto(
                    id = "link-1",
                    token = "token_1",
                    url = "https://homestorag.xyz/join/token_1",
                ),
            ),
        )

    override suspend fun joinRequests(householdId: String): Response<ApiEnvelope<List<JoinRequestDto>>> =
        Response.success(ApiEnvelope(ok = true, data = emptyList()))

    override suspend fun familyMembers(householdId: String): Response<ApiEnvelope<List<MemberDto>>> =
        Response.success(ApiEnvelope(ok = true, data = emptyList()))

    override suspend fun removeMember(
        userId: String,
        request: RemoveMemberRequest,
    ): Response<ApiEnvelope<Unit>> = Response.success(ApiEnvelope(ok = true))

    override suspend fun updateMemberRole(
        userId: String,
        request: UpdateMemberRoleRequest,
    ): Response<ApiEnvelope<Unit>> =
        Response.success(ApiEnvelope(ok = true))

    override suspend fun approveJoinRequest(requestId: String): Response<ApiEnvelope<Unit>> =
        Response.success(ApiEnvelope(ok = true))

    override suspend fun rejectJoinRequest(requestId: String): Response<ApiEnvelope<Unit>> =
        Response.success(ApiEnvelope(ok = true))

    override suspend fun apkVersion(): Response<ApkVersionDto> =
        Response.success(
            ApkVersionDto(
                versionName = "0.0.0",
                versionCode = 0,
                url = "https://homestorag.xyz/apk/home-inventory-internal-latest.apk",
            ),
        )
}
