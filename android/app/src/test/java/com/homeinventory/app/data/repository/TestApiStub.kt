package com.homeinventory.app.data.repository

import com.homeinventory.app.core.network.HomeInventoryApi
import com.homeinventory.app.core.network.LoginRequest
import com.homeinventory.app.data.remote.ApiEnvelope
import com.homeinventory.app.data.remote.AreaCreateRequest
import com.homeinventory.app.data.remote.AreaUpdateRequest
import com.homeinventory.app.data.remote.AuthResponse
import com.homeinventory.app.data.remote.CreateInvitationRequest
import com.homeinventory.app.data.remote.ImportCommitRequest
import com.homeinventory.app.data.remote.ImportPreviewDto
import com.homeinventory.app.data.remote.ImportSummaryDto
import com.homeinventory.app.data.remote.InvitationLinkDto
import com.homeinventory.app.data.remote.ItemCreateRequest
import com.homeinventory.app.data.remote.ItemUpdateRequest
import com.homeinventory.app.data.remote.JoinRequestDto
import com.homeinventory.app.data.remote.LocationCreateRequest
import com.homeinventory.app.data.remote.LocationUpdateRequest
import com.homeinventory.app.data.remote.MobileSyncRequest
import com.homeinventory.app.data.remote.MobileSyncResponse
import com.homeinventory.app.data.remote.RemoteAreaDto
import com.homeinventory.app.data.remote.RemoteDashboardDto
import com.homeinventory.app.data.remote.RemoteItemDto
import com.homeinventory.app.data.remote.RemoteLocationDto
import okhttp3.MultipartBody
import retrofit2.Response

abstract class TestApiStub : HomeInventoryApi {
    override suspend fun login(request: LoginRequest): Response<AuthResponse> =
        Response.success(AuthResponse(ok = true))

    override suspend fun logout(): Response<ApiEnvelope<Unit>> =
        Response.success(ApiEnvelope(ok = true))

    override suspend fun snapshot(): Response<ApiEnvelope<RemoteDashboardDto>> =
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

    override suspend fun approveJoinRequest(requestId: String): Response<ApiEnvelope<Unit>> =
        Response.success(ApiEnvelope(ok = true))

    override suspend fun rejectJoinRequest(requestId: String): Response<ApiEnvelope<Unit>> =
        Response.success(ApiEnvelope(ok = true))
}
