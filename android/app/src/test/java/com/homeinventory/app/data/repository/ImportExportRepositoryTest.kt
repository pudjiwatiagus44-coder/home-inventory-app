package com.homeinventory.app.data.repository

import com.homeinventory.app.data.remote.ApiEnvelope
import com.homeinventory.app.data.remote.ImportConflictDto
import com.homeinventory.app.data.remote.ImportConflictExistingDto
import com.homeinventory.app.data.remote.ImportCreateDto
import com.homeinventory.app.data.remote.ImportPreviewDto
import com.homeinventory.app.data.remote.ImportRowDto
import kotlinx.coroutines.test.runTest
import okhttp3.MultipartBody
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import retrofit2.Response

class ImportExportRepositoryTest {
    @Test
    fun previewParsesConflictAndCreateCounts() = runTest {
        val repository = ImportExportRepository(api = FakeImportApi())

        val result = repository.previewImport(ByteArray(0), "backup.xlsx")

        assertTrue(result.isSuccess)
        assertEquals(1, result.getOrNull()?.conflicts?.size)
        assertEquals(2, result.getOrNull()?.creates?.size)
    }
}

private class FakeImportApi : TestApiStub() {
    override suspend fun previewImport(
        file: MultipartBody.Part,
    ): Response<ApiEnvelope<ImportPreviewDto>> {
        val row = ImportRowDto(
            index = 1,
            name = "牛奶",
            locationName = "冰箱",
            areaName = "厨房",
            note = "",
            expireDate = null,
        )
        return Response.success(
            ApiEnvelope(
                ok = true,
                data = ImportPreviewDto(
                    creates = listOf(
                        ImportCreateDto(row = row),
                        ImportCreateDto(row = row),
                    ),
                    conflicts = listOf(
                        ImportConflictDto(
                            id = "conflict-1",
                            row = row,
                            existingItem = ImportConflictExistingDto(
                                id = "item-1",
                                name = "牛奶",
                                note = "旧备注",
                                expireDate = null,
                                locationName = "冰箱",
                                areaName = "厨房",
                            ),
                        ),
                    ),
                ),
            ),
        )
    }
}
