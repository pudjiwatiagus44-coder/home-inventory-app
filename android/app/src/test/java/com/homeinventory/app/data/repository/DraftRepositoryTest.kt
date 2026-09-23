package com.homeinventory.app.data.repository

import com.homeinventory.app.data.local.DraftDao
import com.homeinventory.app.data.local.DraftEntity
import com.homeinventory.app.data.local.DraftStatus
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class DraftRepositoryTest {
    @Test
    fun clearAllForLogoutDeletesDraftFilesAndUniquePhotoKeysBeforeClearingTable() = runTest {
        val events = mutableListOf<String>()
        val dao = FakeDraftDao(
            drafts = listOf(
                draft(id = "one", photoKey = "shared.jpg"),
                draft(id = "two", photoKey = "shared.jpg"),
            ),
            onClear = { events += "clear-table" },
        )
        val repository = draftRepository(dao) { fileName ->
            events += "delete:$fileName"
        }

        repository.clearAllForLogout()

        assertEquals(
            listOf(
                "delete:draft_one.jpg",
                "delete:shared.jpg",
                "delete:draft_two.jpg",
                "clear-table",
            ),
            events,
        )
        assertTrue(dao.listAll().isEmpty())
    }

    @Test
    fun clearAllForLogoutStillClearsTableWhenOnePhotoDeleteFails() = runTest {
        val events = mutableListOf<String>()
        val dao = FakeDraftDao(
            drafts = listOf(draft(id = "one", photoKey = "photo.jpg")),
            onClear = { events += "clear-table" },
        )
        val repository = draftRepository(dao) { fileName ->
            events += "delete:$fileName"
            if (fileName == "draft_one.jpg") error("cannot delete")
        }

        repository.clearAllForLogout()

        assertEquals(
            listOf("delete:draft_one.jpg", "delete:photo.jpg", "clear-table"),
            events,
        )
        assertTrue(dao.listAll().isEmpty())
    }

    private fun draftRepository(
        dao: DraftDao,
        deletePhoto: (String) -> Unit,
    ) = DraftRepository(
        draftDao = dao,
        api = object : TestApiStub() {},
        savePhoto = { _, _ -> },
        readPhotoFile = { null },
        readPhotoFileLarge = { null },
        readPhotoBytes = { null },
        deletePhotoFile = deletePhoto,
    )

    private fun draft(id: String, photoKey: String?) = DraftEntity(
        id = id,
        photoKey = photoKey,
        name = "draft",
        note = "",
        expireDate = null,
        areaId = null,
        locationId = null,
        status = DraftStatus.Ready,
        createdAt = 1L,
    )

    private class FakeDraftDao(
        drafts: List<DraftEntity>,
        private val onClear: () -> Unit,
    ) : DraftDao {
        private val items = drafts.toMutableList()
        private val flow = MutableStateFlow(items.toList())

        override fun observeAll(): Flow<List<DraftEntity>> = flow
        override suspend fun listAll(): List<DraftEntity> = items.toList()
        override suspend fun getById(id: String): DraftEntity? = items.firstOrNull { it.id == id }
        override suspend fun upsert(draft: DraftEntity) {
            items.removeAll { it.id == draft.id }
            items += draft
            flow.value = items.toList()
        }
        override suspend fun deleteById(id: String) {
            items.removeAll { it.id == id }
            flow.value = items.toList()
        }
        override suspend fun clearAll() {
            onClear()
            items.clear()
            flow.value = emptyList()
        }
    }
}
