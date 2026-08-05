package com.homeinventory.app.data.repository

import com.homeinventory.app.core.network.HomeInventoryApi
import com.homeinventory.app.data.remote.ImportCommitRequest
import com.homeinventory.app.data.remote.ImportPreviewDto
import com.homeinventory.app.data.remote.ImportRowDto
import com.homeinventory.app.data.remote.ImportSummaryDto
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.MultipartBody
import okhttp3.RequestBody.Companion.toRequestBody

class ImportExportRepository(private val api: HomeInventoryApi) {
    suspend fun previewImport(fileBytes: ByteArray, filename: String): Result<ImportPreviewDto> {
        val fileBody = fileBytes.toRequestBody(
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet".toMediaType(),
        )
        val part = MultipartBody.Part.createFormData("file", filename, fileBody)
        val response = try {
            api.previewImport(part)
        } catch (_: Exception) {
            return Result.failure(IllegalStateException("无法连接服务器，请检查网络"))
        }
        val body = response.body()
        if (!response.isSuccessful || body?.ok != true || body.data == null) {
            return Result.failure(
                IllegalStateException(body?.message ?: "导入预检失败"),
            )
        }
        return Result.success(body.data)
    }

    suspend fun commitImport(
        rows: List<ImportRowDto>,
        conflictResolutions: Map<String, String>,
    ): Result<ImportSummaryDto> {
        val response = try {
            api.commitImport(ImportCommitRequest(rows, conflictResolutions))
        } catch (_: Exception) {
            return Result.failure(IllegalStateException("无法连接服务器，请检查网络"))
        }
        val body = response.body()
        if (!response.isSuccessful || body?.ok != true || body.data == null) {
            return Result.failure(
                IllegalStateException(body?.message ?: "导入失败"),
            )
        }
        return Result.success(body.data)
    }
}
