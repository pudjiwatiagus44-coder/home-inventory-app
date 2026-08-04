package com.homeinventory.app.core.network

import com.homeinventory.app.data.remote.ApiEnvelope
import com.homeinventory.app.data.remote.AuthResponse
import com.homeinventory.app.data.remote.MobileSyncRequest
import com.homeinventory.app.data.remote.MobileSyncResponse
import com.homeinventory.app.data.remote.RemoteDashboardDto
import retrofit2.Response
import retrofit2.http.Body
import retrofit2.http.GET
import retrofit2.http.POST

data class LoginRequest(
    val email: String,
    val password: String,
)

interface HomeInventoryApi {
    @POST("api/auth/login")
    suspend fun login(@Body request: LoginRequest): Response<AuthResponse>

    @POST("api/auth/logout")
    suspend fun logout(): Response<ApiEnvelope<Unit>>

    @GET("api/mobile/inventory/snapshot")
    suspend fun snapshot(): Response<ApiEnvelope<RemoteDashboardDto>>

    @POST("api/mobile/inventory/sync")
    suspend fun syncInventory(@Body request: MobileSyncRequest): Response<ApiEnvelope<MobileSyncResponse>>
}
