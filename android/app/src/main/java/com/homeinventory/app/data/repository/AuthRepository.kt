package com.homeinventory.app.data.repository

import com.homeinventory.app.core.network.HomeInventoryApi
import com.homeinventory.app.core.network.LoginRequest
import com.homeinventory.app.core.session.SessionStore

class AuthRepository(
    private val api: HomeInventoryApi,
    private val sessionStore: SessionStore,
) {
    suspend fun login(email: String, password: String): Result<Unit> {
        val response = try {
            api.login(
                LoginRequest(
                    email = email.trim().lowercase(),
                    password = password,
                ),
            )
        } catch (_: Exception) {
            return Result.failure(
                IllegalStateException("无法连接服务器，请检查网络或服务器地址"),
            )
        }
        val setCookie = response.headers()["set-cookie"]
        val body = response.body()

        if (!response.isSuccessful || body?.ok != true || setCookie.isNullOrBlank()) {
            return Result.failure(
                IllegalStateException(body?.message ?: "登录失败，请检查邮箱和密码"),
            )
        }

        sessionStore.saveSessionCookie(setCookie)
        return Result.success(Unit)
    }

    suspend fun logout(): Result<Unit> {
        val response = api.logout()
        sessionStore.clear()

        return if (response.isSuccessful) {
            Result.success(Unit)
        } else {
            Result.failure(IllegalStateException(response.body()?.message ?: "Logout failed"))
        }
    }
}
