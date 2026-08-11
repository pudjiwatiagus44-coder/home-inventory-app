package com.homeinventory.app.data.repository

import com.homeinventory.app.data.remote.ApiEnvelope
import com.homeinventory.app.data.remote.FeedbackRequest
import kotlinx.coroutines.test.runTest
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.ResponseBody.Companion.toResponseBody
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import retrofit2.Response

class FeedbackRepositoryTest {
    @Test
    fun submitFeedbackSendsMessageWithAndroidSource() = runTest {
        val api = RecordingFeedbackApi()
        val repository = FeedbackRepository(api = api, appVersion = "0.5.24")

        val result = repository.submitFeedback("希望支持分类筛选")

        assertTrue(result.isSuccess)
        assertEquals("希望支持分类筛选", api.lastRequest?.message)
        assertEquals("android", api.lastRequest?.source)
        assertEquals("0.5.24", api.lastRequest?.appVersion)
    }

    @Test
    fun submitFeedbackReturnsServerMessageOnFailure() = runTest {
        val api = object : TestApiStub() {
            override suspend fun submitFeedback(
                request: FeedbackRequest,
            ): Response<ApiEnvelope<Unit>> =
                Response.error(
                    400,
                    """{"ok":false,"message":"反馈内容需为 1-2000 个字符"}"""
                        .toResponseBody("application/json".toMediaType()),
                )
        }
        val repository = FeedbackRepository(api = api, appVersion = "0.5.24")

        val result = repository.submitFeedback("")

        assertTrue(result.isFailure)
        assertEquals("反馈内容需为 1-2000 个字符", result.exceptionOrNull()?.message)
    }
}

private class RecordingFeedbackApi : TestApiStub() {
    var lastRequest: FeedbackRequest? = null

    override suspend fun submitFeedback(
        request: FeedbackRequest,
    ): Response<ApiEnvelope<Unit>> {
        lastRequest = request
        return Response.success(ApiEnvelope(ok = true))
    }
}
