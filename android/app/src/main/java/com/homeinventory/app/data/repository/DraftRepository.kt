package com.homeinventory.app.data.repository

import android.graphics.Bitmap
import android.util.Log
import com.homeinventory.app.core.network.HomeInventoryApi
import com.homeinventory.app.data.local.DraftDao
import com.homeinventory.app.data.local.DraftEntity
import com.homeinventory.app.data.local.DraftStatus
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

    fun readPhoto(id: String, photoKey: String?): Bitmap?
}

class DraftRepository(
    private val draftDao: DraftDao,
    private val api: HomeInventoryApi,
    private val savePhoto: (fileName: String, bytes: ByteArray) -> Unit,
    private val readPhotoFile: (fileName: String) -> Bitmap?,
    private val readPhotoBytes: (fileName: String) -> ByteArray?,
    private val deletePhotoFile: (fileName: String) -> Unit,
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
        draftDao.upsert(draft)
        return draft
    }

    override suspend fun recognize(id: String): DraftEntity? {
        val current = draftDao.getById(id) ?: return null
        val bytes = readPhotoBytes(draftFileName(id))
            ?: current.photoKey?.let { readPhotoBytes(it) }
        if (bytes == null) {
            val fallback = current.copy(status = DraftStatus.Ready)
            draftDao.upsert(fallback)
            return fallback
        }
        val part = MultipartBody.Part.createFormData(
            "file",
            "photo.jpg",
            bytes.toRequestBody("image/jpeg".toMediaType()),
        )
        val response = try {
            withTimeout(30_000) { api.recognize(part, "name") }
        } catch (error: TimeoutCancellationException) {
            Log.w("DraftRecognition", "recognize timeout for $id")
            val fallback = current.copy(status = DraftStatus.Ready)
            draftDao.upsert(fallback)
            return fallback
        } catch (error: Exception) {
            Log.w("DraftRecognition", "recognize failed for $id: ${error.message}")
            val fallback = current.copy(status = DraftStatus.Ready)
            draftDao.upsert(fallback)
            return fallback
        }
        val envelope = response.body()
        val data = envelope?.data
        val updated = if (response.isSuccessful && envelope?.ok == true && data != null) {
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
            current.copy(status = DraftStatus.Ready)
        }
        draftDao.upsert(updated)
        return updated
    }

    override suspend fun delete(id: String) {
        val current = draftDao.getById(id)
        draftDao.deleteById(id)
        deletePhotoFile(draftFileName(id))
        current?.photoKey?.let { deletePhotoFile(it) }
    }

    override fun readPhoto(id: String, photoKey: String?): Bitmap? {
        if (photoKey != null) {
            readPhotoFile(photoKey)?.let { return it }
        }
        return readPhotoFile(draftFileName(id))
    }
}
