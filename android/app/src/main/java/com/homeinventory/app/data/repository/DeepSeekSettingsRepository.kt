package com.homeinventory.app.data.repository

import com.google.gson.JsonParser
import com.homeinventory.app.core.network.HomeInventoryApi
import com.homeinventory.app.data.remote.*
import kotlinx.coroutines.CancellationException
import retrofit2.Response

class DeepSeekSettingsRepository(private val api: HomeInventoryApi) {
    suspend fun status() = call { api.deepSeekStatus() }
    suspend fun save(key: String): Result<DeepSeekCredentialStatusDto> {
        if (key.isBlank()) return Result.failure(IllegalStateException("请输入 API Key"))
        return call { api.deepSeekSave(DeepSeekSaveRequest(key.trim())) }
    }
    suspend fun validate(): Result<DeepSeekCredentialStatusDto> = call { api.deepSeekValidate() }.map { it.status }
    suspend fun delete(): Result<Unit> = call { api.deepSeekDelete() }.map { Unit }

    private suspend fun <T> call(block: suspend () -> Response<ApiEnvelope<T>>): Result<T> {
        try {
            val response = block()
            val envelope = response.body()
            if (response.isSuccessful && envelope?.ok == true && envelope.data != null) return Result.success(envelope.data)
            val code = try { JsonParser.parseString(response.errorBody()?.string()).asJsonObject.get("code")?.asString } catch (_: Exception) { null }
            val message = when (code) {
                "DEEPSEEK_AUTH_INVALID" -> "DeepSeek 密钥无效，请重新输入"
                "DEEPSEEK_CREDENTIAL_NOT_CONFIGURED" -> "尚未配置 DeepSeek API Key"
                "DEEPSEEK_TIMEOUT" -> "连接检查超时，请重试"
                else -> when (response.code()) {
                    401 -> "登录已失效，请重新登录"
                    404 -> "尚未配置密钥，或服务器尚未更新"
                    429 -> "请求过于频繁，请稍后重试"
                    501, 503 -> "服务器密钥托管暂时不可用"
                    else -> "操作失败，请稍后重试"
                }
            }
            return Result.failure(IllegalStateException(message))
        } catch (error: CancellationException) { throw error }
        catch (_: Exception) { return Result.failure(IllegalStateException("无法连接服务器，请检查网络")) }
    }
}
