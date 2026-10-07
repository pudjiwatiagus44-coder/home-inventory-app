package com.homeinventory.app.data.repository

import com.homeinventory.app.data.recognition.RecognitionSettings
import com.homeinventory.app.data.remote.ApiEnvelope
import com.homeinventory.app.data.remote.DeepSeekCredentialStatusDto
import com.homeinventory.app.data.remote.DeepSeekValidationDto
import com.homeinventory.app.data.remote.DeepSeekSaveRequest
import kotlinx.coroutines.test.runTest
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.ResponseBody.Companion.toResponseBody
import org.junit.Assert.*
import org.junit.Test
import retrofit2.Response

class DeepSeekSettingsRepositoryTest {
    @Test fun accountSwitchDoesNotReuseProvider() {
        val data = mutableMapOf<String, String>()
        var account: String? = "a"
        val settings = RecognitionSettings({ account }, { data[it] }, { k, v -> if (v == null) data.remove(k) else data[k] = v })
        settings.select("DEEPSEEK")
        assertEquals("DEEPSEEK", settings.provider())
        account = "b"
        assertEquals("DOUBAO", settings.provider())
        account = null
        assertEquals("DOUBAO", settings.provider())
        account = "a"
        assertEquals("DEEPSEEK", settings.provider())
    }
    @Test fun draftKeepsProviderAndRejectsAnotherAccount() {
        val data = mutableMapOf<String, String>()
        var account: String? = "a"
        val settings = RecognitionSettings({ account }, { data[it] }, { k, v -> if (v == null) data.remove(k) else data[k] = v })
        settings.select("DEEPSEEK")
        settings.captureDraft("draft")
        settings.select("DOUBAO")
        assertEquals("DEEPSEEK", settings.providerForDraft("draft"))
        account = "b"
        assertTrue(runCatching { settings.providerForDraft("draft") }.isFailure)
    }
    @Test fun distinguishesInvalidKeyFromExpiredLogin() = runTest {
        suspend fun failure(body: String): String? {
            val api = object : TestApiStub() {
                override suspend fun deepSeekValidate(): Response<ApiEnvelope<DeepSeekValidationDto>> =
                    Response.error(401, body.toResponseBody("application/json".toMediaType()))
            }
            return DeepSeekSettingsRepository(api).validate().exceptionOrNull()?.message
        }
        assertEquals("DeepSeek 密钥无效，请重新输入", failure("{\"ok\":false,\"code\":\"DEEPSEEK_AUTH_INVALID\"}"))
        assertEquals("登录已失效，请重新登录", failure("{\"ok\":false,\"message\":\"Authentication required\"}"))
    }
    @Test fun saveDoesNotClaimConnectivityWasValidated() = runTest {
        var saved: String? = null
        val api = object : TestApiStub() {
            override suspend fun deepSeekSave(request: DeepSeekSaveRequest): Response<ApiEnvelope<DeepSeekCredentialStatusDto>> {
                saved = request.apiKey
                return Response.success(ApiEnvelope(true, DeepSeekCredentialStatusDto(true, "••••1234", null)))
            }
        }
        val result = DeepSeekSettingsRepository(api).save("  synthetic-key  ")
        assertEquals("synthetic-key", saved)
        assertTrue(result.isSuccess)
        assertNull(result.getOrThrow().lastVerifiedAt)
    }
}
