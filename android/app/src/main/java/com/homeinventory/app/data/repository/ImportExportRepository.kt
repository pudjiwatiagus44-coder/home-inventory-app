package com.homeinventory.app.data.repository

import android.content.ContentValues
import android.content.Context
import android.os.Environment
import android.provider.MediaStore
import com.homeinventory.app.core.network.HomeInventoryApi
import com.homeinventory.app.data.excel.BackupRow
import com.homeinventory.app.data.excel.ExcelBackupGenerator
import com.homeinventory.app.data.remote.ImportCommitRequest
import com.homeinventory.app.data.remote.ImportPreviewDto
import com.homeinventory.app.data.remote.ImportRowDto
import com.homeinventory.app.data.remote.ImportSummaryDto
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.MultipartBody
import okhttp3.RequestBody.Companion.toRequestBody

class ImportExportRepository(private val api: HomeInventoryApi) {
    suspend fun exportBackup(
        rows: List<BackupRow>,
        filename: String = ExcelBackupGenerator.filename(),
        context: Context,
    ): Result<String> {
        return try {
            val bytes = ExcelBackupGenerator.generate(rows)
            saveToDownloads(context, filename, bytes)
            Result.success(filename)
        } catch (error: Exception) {
            Result.failure(error)
        }
    }

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

    private fun saveToDownloads(context: Context, filename: String, bytes: ByteArray) {
        val values = ContentValues().apply {
            put(MediaStore.MediaColumns.DISPLAY_NAME, filename)
            put(
                MediaStore.MediaColumns.MIME_TYPE,
                "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            )
            put(MediaStore.MediaColumns.RELATIVE_PATH, Environment.DIRECTORY_DOWNLOADS)
        }
        val resolver = context.contentResolver
        val uri = resolver.insert(MediaStore.Files.getContentUri("external"), values)
            ?: throw IllegalStateException("无法创建导出文件")
        resolver.openOutputStream(uri)?.use { output ->
            output.write(bytes)
        } ?: throw IllegalStateException("无法写入导出文件")
    }
}
