package com.homeinventory.app.data.repository

import android.graphics.Bitmap
import com.homeinventory.app.core.network.HomeInventoryApi
import com.homeinventory.app.data.local.DraftDao
import com.homeinventory.app.data.local.DraftEntity
import com.homeinventory.app.data.local.DraftStatus
import com.homeinventory.app.data.recognition.RecognitionSettings
import kotlinx.coroutines.CancellationException
import java.util.UUID
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.TimeoutCancellationException
import kotlinx.coroutines.withTimeout
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.MultipartBody
import okhttp3.RequestBody.Companion.toRequestBody

interface DraftGateway {
    fun observe(): Flow<List<DraftEntity>>

    suspend fun create(
        bytes: ByteArray?,
        name: String,
        note: String,
        expireDate: String?,
        areaId: String?,
        locationId: String?,
        photoKey: String?,
    ): DraftEntity

    suspend fun recognize(id: String): DraftEntity?

    suspend fun delete(id: String)

    suspend fun deleteAfterConfirm(id: String)

    fun readPhoto(id: String, photoKey: String?): Bitmap?

    fun readPhotoLarge(id: String, photoKey: String?): Bitmap?
}

class DraftRepository(
    private val draftDao: DraftDao,
    private val api: HomeInventoryApi,
    private val savePhoto: (fileName: String, bytes: ByteArray) -> Unit,
    private val readPhotoFile: (fileName: String) -> Bitmap?,
    private val readPhotoFileLarge: (fileName: String) -> Bitmap?,
    private val readPhotoBytes: (fileName: String) -> ByteArray?,
    private val deletePhotoFile: (fileName: String) -> Unit,
    private val recognitionSettings: RecognitionSettings? = null,
) : DraftGateway {
    override fun observe(): Flow<List<DraftEntity>> = draftDao.observeAll()

    private fun draftFileName(id: String) = "draft_$id.jpg"

    override suspend fun create(
        bytes: ByteArray?,
        name: String,
        note: String,
        expireDate: String?,
        areaId: String?,
        locationId: String?,
        photoKey: String?,
    ): DraftEntity {
        val id = "draft-${UUID.randomUUID()}"
        val normalizedPhotoKey = photoKey?.takeIf { it.isNotBlank() }
        if (bytes != null) {
            savePhoto(draftFileName(id), bytes)
        }
        val ready = name.isNotBlank() && normalizedPhotoKey != null
        val draft = DraftEntity(
            id = id,
            photoKey = normalizedPhotoKey,
            name = name,
            note = note,
            expireDate = expireDate,
            areaId = areaId,
            locationId = locationId,
            status = if (ready) DraftStatus.Ready else DraftStatus.Recognizing,
            createdAt = System.currentTimeMillis(),
        )
        recognitionSettings?.captureDraft(id)
        draftDao.upsert(draft)
        return draft
    }

    override suspend fun recognize(id: String): DraftEntity? {
        val current = draftDao.getById(id) ?: return null
        val bytes = readPhotoBytes(draftFileName(id))
            ?: current.photoKey?.let { readPhotoBytes(it) }
        if (bytes == null) {
            val fallback = current.copy(status = if (current.name.isBlank()) DraftStatus.Failed else DraftStatus.Ready)
            draftDao.upsert(fallback)
            return fallback
        }
        val part = MultipartBody.Part.createFormData(
            "file",
            "photo.jpg",
            bytes.toRequestBody("image/jpeg".toMediaType()),
        )
        draftDao.upsert(current.copy(status = DraftStatus.Recognizing))
        var expectedProvider = "DOUBAO"
        val response = try {
            withTimeout(30_000) {
                expectedProvider = recognitionSettings?.providerForDraft(id) ?: "DOUBAO"
                com.homeinventory.app.data.recognition.requireRecognitionProvider(api, expectedProvider)
                recognitionSettings?.providerForDraft(id)
                api.recognize(part, "name", expectedProvider)
            }
        } catch (error: TimeoutCancellationException) {
            val fallback = current.copy(status = DraftStatus.Failed)
            draftDao.upsert(fallback)
            return fallback
        } catch (error: CancellationException) { throw error }
        catch (_: Exception) {
            val fallback = current.copy(status = DraftStatus.Failed)
            draftDao.upsert(fallback)
            return fallback
        }
        val envelope = response.body()
        val data = envelope?.data
        val stillOwned = runCatching { recognitionSettings?.providerForDraft(id) }.isSuccess
        val updated = if (response.isSuccessful && envelope?.ok == true && data != null && data.recognized &&
            stillOwned && (expectedProvider != "DEEPSEEK" || data.provider == expectedProvider)) {
            val key = data.thumbnailId
            if (key != null && key.isNotBlank()) {
                try {
                    savePhoto(key, bytes)
                } catch (_: Exception) {
                    // local copy is best-effort; keep server thumbnail as source
                }
            }
            current.copy(
                photoKey = key?.takeIf { it.isNotBlank() } ?: current.photoKey,
                name = data.name ?: current.name,
                note = data.note ?: current.note,
                status = DraftStatus.Ready,
            )
        } else {
            current.copy(status = DraftStatus.Failed)
        }
        draftDao.upsert(updated)
        return updated
    }

    override suspend fun delete(id: String) {
        recognitionSettings?.forgetDraft(id)
        val current = draftDao.getById(id)
        draftDao.deleteById(id)
        deletePhotoFile(draftFileName(id))
        current?.photoKey?.let { deletePhotoFile(it) }
    }

    override suspend fun deleteAfterConfirm(id: String) {
        recognitionSettings?.forgetDraft(id)
        draftDao.deleteById(id)
        deletePhotoFile(draftFileName(id))
        // keep the photoKey local file: it now belongs to the saved item
    }

    override fun readPhoto(id: String, photoKey: String?): Bitmap? {
        if (photoKey != null) {
            readPhotoFile(photoKey)?.let { return it }
        }
        return readPhotoFile(draftFileName(id))
    }

    override fun readPhotoLarge(id: String, photoKey: String?): Bitmap? {
        if (photoKey != null) {
            readPhotoFileLarge(photoKey)?.let { return it }
        }
        return readPhotoFileLarge(draftFileName(id))
    }
}
