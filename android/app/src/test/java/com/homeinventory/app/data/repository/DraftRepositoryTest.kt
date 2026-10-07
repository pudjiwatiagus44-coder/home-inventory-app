package com.homeinventory.app.data.repository

import com.homeinventory.app.data.local.*
import com.homeinventory.app.data.recognition.RecognitionSettings
import com.homeinventory.app.data.remote.*
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.test.runTest
import okhttp3.MultipartBody
import org.junit.Assert.*
import org.junit.Test
import retrofit2.Response

class DraftRepositoryTest {
    @Test fun capabilityCheckTimeoutMarksDraftFailedWithoutSendingImage() = runTest {
        val metadata = mutableMapOf<String, String>()
        val settings = RecognitionSettings({ "a" }, { metadata[it] }, { k, v -> if (v == null) metadata.remove(k) else metadata[k] = v })
        settings.select("DEEPSEEK")
        var calls = 0
        val api = object : TestApiStub() {
            override suspend fun recognitionProviders(): Response<ApiEnvelope<RecognitionProvidersDto>> {
                kotlinx.coroutines.delay(60_000)
                return super.recognitionProviders()
            }
            override suspend fun recognize(file: MultipartBody.Part, mode: String, provider: String?): Response<ApiEnvelope<RecognitionResponseDto>> {
                calls++
                return super.recognize(file, mode, provider)
            }
        }
        val dao = MemoryDraftDao()
        val repository = repository(api, dao, settings)
        val draft = repository.create(byteArrayOf(1), "", "", null, null, null, null)
        assertEquals(DraftStatus.Failed, repository.recognize(draft.id)?.status)
        assertEquals(0, calls)
    }
    @Test fun failedDraftCanRetryItsOriginalPhotoAfterProviderRecovers() = runTest {
        val metadata = mutableMapOf<String, String>()
        val settings = RecognitionSettings({ "a" }, { metadata[it] }, { k, v -> if (v == null) metadata.remove(k) else metadata[k] = v })
        settings.select("DEEPSEEK")
        var recovered = false
        val seen = mutableListOf<String?>()
        val api = object : TestApiStub() {
            override suspend fun recognize(file: MultipartBody.Part, mode: String, provider: String?): Response<ApiEnvelope<RecognitionResponseDto>> {
                seen.add(provider)
                if (!recovered) return Response.success(ApiEnvelope(false, message = "暂时失败"))
                return super.recognize(file, mode, provider)
            }
        }
        val dao = MemoryDraftDao()
        val repository = repository(api, dao, settings)
        val draft = repository.create(byteArrayOf(1), "", "", null, null, null, null)
        assertEquals(DraftStatus.Failed, repository.recognize(draft.id)?.status)
        recovered = true
        settings.select("DOUBAO")
        assertEquals(DraftStatus.Ready, repository.recognize(draft.id)?.status)
        assertEquals(listOf("DEEPSEEK", "DEEPSEEK"), seen)
        assertEquals("牛奶", dao.getById(draft.id)?.name)
    }
    @Test fun taskUsesProviderCapturedAtCreation() = runTest {
        val metadata = mutableMapOf<String, String>()
        val settings = RecognitionSettings({ "a" }, { metadata[it] }, { k, v -> if (v == null) metadata.remove(k) else metadata[k] = v })
        settings.select("DEEPSEEK")
        var seenProvider: String? = null
        val api = object : TestApiStub() {
            override suspend fun recognize(file: MultipartBody.Part, mode: String, provider: String?): Response<ApiEnvelope<RecognitionResponseDto>> {
                seenProvider = provider
                return super.recognize(file, mode, provider)
            }
        }
        val dao = MemoryDraftDao()
        val repository = repository(api, dao, settings)
        val draft = repository.create(byteArrayOf(1), "", "", null, null, null, null)
        settings.select("DOUBAO")
        assertEquals(DraftStatus.Ready, repository.recognize(draft.id)?.status)
        assertEquals("DEEPSEEK", seenProvider)
    }
    @Test fun switchedAccountDoesNotInvokeRecognitionWithAnotherAccountsTask() = runTest {
        val metadata = mutableMapOf<String, String>()
        var account = "a"
        val settings = RecognitionSettings({ account }, { metadata[it] }, { k, v -> if (v == null) metadata.remove(k) else metadata[k] = v })
        settings.select("DEEPSEEK")
        var calls = 0
        val api = object : TestApiStub() {
            override suspend fun recognize(file: MultipartBody.Part, mode: String, provider: String?): Response<ApiEnvelope<RecognitionResponseDto>> {
                calls++
                return super.recognize(file, mode, provider)
            }
        }
        val dao = MemoryDraftDao()
        val repository = repository(api, dao, settings)
        val draft = repository.create(byteArrayOf(1), "", "", null, null, null, null)
        account = "b"
        assertEquals(DraftStatus.Failed, repository.recognize(draft.id)?.status)
        assertEquals(0, calls)
    }
    private fun repository(api: TestApiStub, dao: DraftDao, settings: RecognitionSettings) = DraftRepository(
        draftDao = dao, api = api, savePhoto = { _, _ -> }, readPhotoFile = { null }, readPhotoFileLarge = { null },
        readPhotoBytes = { byteArrayOf(1) }, deletePhotoFile = {}, recognitionSettings = settings,
    )
}
private class MemoryDraftDao : DraftDao {
    private val rows = MutableStateFlow<List<DraftEntity>>(emptyList())
    override fun observeAll(): Flow<List<DraftEntity>> = rows
    override suspend fun getById(id: String) = rows.value.firstOrNull { it.id == id }
    override suspend fun upsert(draft: DraftEntity) { rows.value = rows.value.filterNot { it.id == draft.id } + draft }
    override suspend fun deleteById(id: String) { rows.value = rows.value.filterNot { it.id == id } }
}
