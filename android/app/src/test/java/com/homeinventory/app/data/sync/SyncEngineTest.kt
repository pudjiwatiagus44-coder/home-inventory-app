package com.homeinventory.app.data.sync

import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertEquals
import org.junit.Test

class SyncEngineTest {
    @Test
    fun uploadsPendingCreateWhenNetworkReturns() = runTest {
        val queue = FakePendingQueue(
            pending = listOf(
                PendingSyncOperation(
                    clientOperationId = "op-1",
                    entity = "item",
                    action = "create",
                    localId = "local-item-1",
                    serverId = null,
                    baseServerUpdatedAt = null,
                    payloadJson = """{"name":"Milk","note":"","expireDate":null,"locationId":null}""",
                ),
            ),
        )
        val remote = FakeRemoteSync()
        val engine = SyncEngine(queue = queue, remote = remote)

        engine.syncPendingOperations()

        assertEquals(listOf("op-1"), remote.uploadedOperationIds)
        assertEquals(emptyList<String>(), queue.remainingOperationIds())
    }
}

private class FakePendingQueue(
    pending: List<PendingSyncOperation>,
) : PendingOperationQueue {
    private val operations = pending.toMutableList()

    override suspend fun pendingOperations(): List<PendingSyncOperation> = operations.toList()

    override suspend fun markApplied(clientOperationId: String) {
        operations.removeAll { it.clientOperationId == clientOperationId }
    }

    override suspend fun markConflict(clientOperationId: String, message: String) {
        operations.removeAll { it.clientOperationId == clientOperationId }
    }

    fun remainingOperationIds(): List<String> = operations.map { it.clientOperationId }
}

private class FakeRemoteSync : RemoteSyncClient {
    val uploadedOperationIds = mutableListOf<String>()

    override suspend fun submit(operations: List<PendingSyncOperation>): RemoteSyncResult {
        uploadedOperationIds += operations.map { it.clientOperationId }
        return RemoteSyncResult(
            appliedClientOperationIds = operations.map { it.clientOperationId },
            conflicts = emptyList(),
        )
    }
}
