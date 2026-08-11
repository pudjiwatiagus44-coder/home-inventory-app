package com.homeinventory.app.core.network

import com.homeinventory.app.data.remote.ApiEnvelope
import com.homeinventory.app.data.remote.AreaCreateRequest
import com.homeinventory.app.data.remote.AreaUpdateRequest
import com.homeinventory.app.data.remote.ApkVersionDto
import com.homeinventory.app.data.remote.AuthResponse
import com.homeinventory.app.data.remote.CreateInvitationRequest
import com.homeinventory.app.data.remote.CreateHouseholdRequest
import com.homeinventory.app.data.remote.FeedbackRequest
import com.homeinventory.app.data.remote.ImportCommitRequest
import com.homeinventory.app.data.remote.ImportPreviewDto
import com.homeinventory.app.data.remote.ImportSummaryDto
import com.homeinventory.app.data.remote.InvitationLinkDto
import com.homeinventory.app.data.remote.HouseholdDto
import com.homeinventory.app.data.remote.HouseholdDisplayNameRequest
import com.homeinventory.app.data.remote.ItemCreateRequest
import com.homeinventory.app.data.remote.ItemUpdateRequest
import com.homeinventory.app.data.remote.JoinRequestDto
import com.homeinventory.app.data.remote.MemberDto
import com.homeinventory.app.data.remote.LocationCreateRequest
import com.homeinventory.app.data.remote.LocationUpdateRequest
import com.homeinventory.app.data.remote.MobileSyncRequest
import com.homeinventory.app.data.remote.MobileSyncResponse
import com.homeinventory.app.data.remote.PhotoUploadResponseDto
import com.homeinventory.app.data.remote.RemoteDashboardDto
import com.homeinventory.app.data.remote.RemoteAreaDto
import com.homeinventory.app.data.remote.RemoteHouseholdDto
import com.homeinventory.app.data.remote.RemoteItemDto
import com.homeinventory.app.data.remote.RemoteLocationDto
import com.homeinventory.app.data.remote.RecognitionResponseDto
import com.homeinventory.app.data.remote.RenameHouseholdRequest
import com.homeinventory.app.data.remote.RemoveMemberRequest
import com.homeinventory.app.data.remote.UpdateMemberRoleRequest
import okhttp3.MultipartBody
import okhttp3.ResponseBody
import retrofit2.Response
import retrofit2.http.Body
import retrofit2.http.DELETE
import retrofit2.http.GET
import retrofit2.http.Multipart
import retrofit2.http.PATCH
import retrofit2.http.POST
import retrofit2.http.PUT
import retrofit2.http.Part
import retrofit2.http.Path
import retrofit2.http.Query

data class LoginRequest(
    val email: String,
    val password: String,
)

data class RegisterRequest(
    val email: String,
    val password: String,
)

data class ForgotPasswordRequest(
    val email: String,
)

interface HomeInventoryApi {
    @POST("api/auth/login")
    suspend fun login(@Body request: LoginRequest): Response<AuthResponse>

    @POST("api/auth/register")
    suspend fun register(@Body request: RegisterRequest): Response<AuthResponse>

    @POST("api/auth/forgot-password")
    suspend fun forgotPassword(@Body request: ForgotPasswordRequest): Response<ApiEnvelope<Unit>>

    @POST("api/auth/logout")
    suspend fun logout(): Response<ApiEnvelope<Unit>>

    @POST("api/feedback")
    suspend fun submitFeedback(
        @Body request: FeedbackRequest,
    ): Response<ApiEnvelope<Unit>>

    @GET("api/family/households")
    suspend fun households(): Response<ApiEnvelope<List<HouseholdDto>>>

    @POST("api/family/households")
    suspend fun createHousehold(
        @Body request: CreateHouseholdRequest,
    ): Response<ApiEnvelope<RemoteHouseholdDto>>

    @GET("api/mobile/inventory/snapshot")
    suspend fun snapshot(
        @Query("householdId") householdId: String? = null,
    ): Response<ApiEnvelope<RemoteDashboardDto>>

    @POST("api/mobile/inventory/sync")
    suspend fun syncInventory(@Body request: MobileSyncRequest): Response<ApiEnvelope<MobileSyncResponse>>

    @POST("api/inventory/areas")
    suspend fun createArea(@Body request: AreaCreateRequest): Response<ApiEnvelope<RemoteAreaDto>>

    @PATCH("api/inventory/areas/{areaId}")
    suspend fun updateArea(
        @Path("areaId") areaId: String,
        @Body request: AreaUpdateRequest,
    ): Response<ApiEnvelope<RemoteAreaDto>>

    @DELETE("api/inventory/areas/{areaId}")
    suspend fun deleteArea(
        @Path("areaId") areaId: String,
        @Query("householdId") householdId: String? = null,
    ): Response<ApiEnvelope<Unit>>

    @POST("api/inventory/locations")
    suspend fun createLocation(@Body request: LocationCreateRequest): Response<ApiEnvelope<RemoteLocationDto>>

    @PATCH("api/inventory/locations/{locationId}")
    suspend fun updateLocation(
        @Path("locationId") locationId: String,
        @Body request: LocationUpdateRequest,
    ): Response<ApiEnvelope<RemoteLocationDto>>

    @DELETE("api/inventory/locations/{locationId}")
    suspend fun deleteLocation(
        @Path("locationId") locationId: String,
        @Query("householdId") householdId: String? = null,
    ): Response<ApiEnvelope<Unit>>

    @POST("api/inventory/items")
    suspend fun createItem(@Body request: ItemCreateRequest): Response<ApiEnvelope<RemoteItemDto>>

    @PATCH("api/inventory/items/{itemId}")
    suspend fun updateItem(
        @Path("itemId") itemId: String,
        @Body request: ItemUpdateRequest,
    ): Response<ApiEnvelope<RemoteItemDto>>

    @DELETE("api/inventory/items/{itemId}")
    suspend fun deleteItem(
        @Path("itemId") itemId: String,
        @Query("householdId") householdId: String? = null,
    ): Response<ApiEnvelope<Unit>>

    @Multipart
    @POST("api/recognition")
    suspend fun recognize(
        @Part file: MultipartBody.Part,
        @Query("mode") mode: String,
        @Query("householdId") householdId: String? = null,
    ): Response<ApiEnvelope<RecognitionResponseDto>>

    @GET("api/inventory/items/{itemId}/photo")
    suspend fun itemPhoto(
        @Path("itemId") itemId: String,
        @Query("householdId") householdId: String? = null,
    ): Response<ResponseBody>

    @Multipart
    @PUT("api/inventory/areas/{areaId}/photo")
    suspend fun uploadAreaPhoto(
        @Path("areaId") areaId: String,
        @Part file: MultipartBody.Part,
        @Query("householdId") householdId: String? = null,
    ): Response<ApiEnvelope<PhotoUploadResponseDto>>

    @GET("api/inventory/areas/{areaId}/photo")
    suspend fun areaPhoto(
        @Path("areaId") areaId: String,
        @Query("householdId") householdId: String? = null,
    ): Response<ResponseBody>

    @DELETE("api/inventory/areas/{areaId}/photo")
    suspend fun deleteAreaPhoto(
        @Path("areaId") areaId: String,
        @Query("householdId") householdId: String? = null,
    ): Response<ApiEnvelope<Unit>>

    @Multipart
    @PUT("api/inventory/locations/{locationId}/photo")
    suspend fun uploadLocationPhoto(
        @Path("locationId") locationId: String,
        @Part file: MultipartBody.Part,
        @Query("householdId") householdId: String? = null,
    ): Response<ApiEnvelope<PhotoUploadResponseDto>>

    @GET("api/inventory/locations/{locationId}/photo")
    suspend fun locationPhoto(
        @Path("locationId") locationId: String,
        @Query("householdId") householdId: String? = null,
    ): Response<ResponseBody>

    @DELETE("api/inventory/locations/{locationId}/photo")
    suspend fun deleteLocationPhoto(
        @Path("locationId") locationId: String,
        @Query("householdId") householdId: String? = null,
    ): Response<ApiEnvelope<Unit>>

    @Multipart
    @POST("api/inventory/import")
    suspend fun previewImport(
        @Part file: MultipartBody.Part,
    ): Response<ApiEnvelope<ImportPreviewDto>>

    @POST("api/inventory/import?mode=commit")
    suspend fun commitImport(@Body request: ImportCommitRequest): Response<ApiEnvelope<ImportSummaryDto>>

    @POST("api/family/invitations")
    suspend fun createInvitation(@Body request: CreateInvitationRequest): Response<ApiEnvelope<InvitationLinkDto>>

    @GET("api/family/join-requests")
    suspend fun joinRequests(@Query("householdId") householdId: String): Response<ApiEnvelope<List<JoinRequestDto>>>

    @GET("api/family/members")
    suspend fun familyMembers(@Query("householdId") householdId: String): Response<ApiEnvelope<List<MemberDto>>>

    @DELETE("api/family/members/{userId}")
    suspend fun removeMember(
        @Path("userId") userId: String,
        @Body request: RemoveMemberRequest,
    ): Response<ApiEnvelope<Unit>>

    @PATCH("api/family/members/{userId}")
    suspend fun updateMemberRole(
        @Path("userId") userId: String,
        @Body request: UpdateMemberRoleRequest,
    ): Response<ApiEnvelope<Unit>>

    @PATCH("api/family/households")
    suspend fun renameHousehold(
        @Body request: RenameHouseholdRequest,
    ): Response<ApiEnvelope<RemoteHouseholdDto>>

    @PATCH("api/family/households/display-name")
    suspend fun setHouseholdDisplayName(
        @Body request: HouseholdDisplayNameRequest,
    ): Response<ApiEnvelope<Unit>>

    @POST("api/family/join-requests/{requestId}/approve")
    suspend fun approveJoinRequest(@Path("requestId") requestId: String): Response<ApiEnvelope<Unit>>

    @POST("api/family/join-requests/{requestId}/reject")
    suspend fun rejectJoinRequest(@Path("requestId") requestId: String): Response<ApiEnvelope<Unit>>

    @GET("apk/version.json")
    suspend fun apkVersion(): Response<ApkVersionDto>
}
