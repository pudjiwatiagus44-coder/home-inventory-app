package com.homeinventory.app.data.repository

import com.homeinventory.app.core.network.HomeInventoryApi
import com.homeinventory.app.core.network.LoginRequest
import com.homeinventory.app.core.network.RegisterRequest
import com.homeinventory.app.core.network.ForgotPasswordRequest
import com.homeinventory.app.core.session.SessionStore
import com.homeinventory.app.data.remote.AuthResponse
import com.google.gson.JsonParser
import retrofit2.Response

class AuthRepository(
    private val api: HomeInventoryApi,
    private val sessionStore: SessionStore,
) {
    suspend fun login(email: String, password: String): Result<Unit> = authenticate(
        fallbackMessage = "登录失败，请检查邮箱和密码",
    ) {
        api.login(
            LoginRequest(
                email = email.trim().lowercase(),
                password = password,
            ),
        )
    }

    suspend fun register(email: String, password: String): Result<Unit> = authenticate(
        fallbackMessage = "注册失败，请检查邮箱和密码",
    ) {
        api.register(
            RegisterRequest(
                email = email.trim().lowercase(),
                password = password,
            ),
        )
    }

    suspend fun forgotPassword(email: String): Result<Unit> {
        val response = try {
            api.forgotPassword(
                ForgotPasswordRequest(
                    email = email.trim().lowercase(),
                ),
            )
        } catch (_: Exception) {
            return Result.failure(
                IllegalStateException("无法连接服务器，请检查网络或服务器地址"),
            )
        }
        val body = response.body()

        return if (response.isSuccessful && body?.ok == true) {
            Result.success(Unit)
        } else {
            Result.failure(
                IllegalStateException(errorMessage(response, "请求失败，请稍后再试")),
            )
        }
    }

    private suspend fun authenticate(
        fallbackMessage: String,
        call: suspend () -> Response<AuthResponse>,
    ): Result<Unit> {
        val response = try {
            call()
        } catch (_: Exception) {
            return Result.failure(
                IllegalStateException("无法连接服务器，请检查网络或服务器地址"),
            )
        }
        val setCookie = response.headers()["set-cookie"]
        val body = response.body()

        if (!response.isSuccessful || body?.ok != true || setCookie.isNullOrBlank()) {
            return Result.failure(
                IllegalStateException(errorMessage(response, fallbackMessage)),
            )
        }

        sessionStore.saveSessionCookie(setCookie)
        return Result.success(Unit)
    }

    private fun errorMessage(response: Response<*>, fallback: String): String {
        val raw = try {
            response.errorBody()?.string()
        } catch (_: Exception) {
            null
        }
        val message = raw?.let {
            try {
                JsonParser.parseString(it).asJsonObject.get("message")?.asString
            } catch (_: Exception) {
                null
            }
        }
        return message?.takeIf { it.isNotBlank() } ?: fallback
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
