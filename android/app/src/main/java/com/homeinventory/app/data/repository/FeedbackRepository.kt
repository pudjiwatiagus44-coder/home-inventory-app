package com.homeinventory.app.data.repository

import com.google.gson.JsonParser
import com.homeinventory.app.core.network.HomeInventoryApi
import com.homeinventory.app.data.remote.ApiEnvelope
import com.homeinventory.app.data.remote.FeedbackRequest
import okhttp3.ResponseBody
import retrofit2.Response

class FeedbackRepository(
    private val api: HomeInventoryApi,
    private val appVersion: String,
) {
    suspend fun submitFeedback(message: String): Result<Unit> {
        val response = try {
            api.submitFeedback(
                FeedbackRequest(
                    message = message,
                    source = "android",
                    appVersion = appVersion,
                ),
            )
        } catch (_: Exception) {
            return Result.failure(IllegalStateException("无法连接服务器，请检查网络"))
        }

        if (!response.isSuccessful || response.body()?.ok != true) {
            return Result.failure(
                IllegalStateException(
                    parseErrorMessage(response.errorBody())
                        ?: response.body()?.message
                        ?: "反馈发送失败",
                ),
            )
        }

        return Result.success(Unit)
    }

    private fun parseErrorMessage(errorBody: ResponseBody?): String? {
        if (errorBody == null) return null
        return try {
            JsonParser.parseString(errorBody.string())
                .asJsonObject["message"]
                ?.asString
        } catch (_: Exception) {
            null
        }
    }
}
