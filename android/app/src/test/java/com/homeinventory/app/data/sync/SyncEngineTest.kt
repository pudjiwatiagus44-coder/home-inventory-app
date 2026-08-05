package com.homeinventory.app.data.sync

import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
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
        val remote = FakeRemoteSync(appliedIds = listOf("op-1"))
        val engine = SyncEngine(queue = queue, remote = remote)

        engine.syncPendingOperations()

        assertEquals(emptyList<String>(), queue.remainingOperationIds())
    }

    @Test
    fun syncMarksAppliedOperationAndReplacesLocalId() = runTest {
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
        val applied = mutableListOf<RemoteSyncApplied>()
        val remote = FakeRemoteSync(appliedIds = listOf("op-1"))
        val engine = SyncEngine(
            queue = queue,
            remote = remote,
            onOperationApplied = { applied += it },
        )

        engine.syncPendingOperations()

        assertEquals(emptyList<String>(), queue.remainingOperationIds())
        assertEquals("server-item-1", applied.single().serverId)
        assertEquals("local-item-1", applied.single().localId)
        assertEquals("item", applied.single().entity)
    }

    @Test
    fun syncMarksConflictWithoutApplying() = runTest {
        val queue = FakePendingQueue(
            pending = listOf(
                PendingSyncOperation(
                    clientOperationId = "op-conflict",
                    entity = "item",
                    action = "update",
                    localId = "item-1",
                    serverId = "item-1",
                    baseServerUpdatedAt = "2026-08-04T00:00:00.000Z",
                    payloadJson = """{"name":"Milk","note":"","expireDate":null,"locationId":null}""",
                ),
            ),
        )
        val remote = FakeRemoteSync(conflictIds = listOf("op-conflict"))
        val engine = SyncEngine(queue = queue, remote = remote)

        engine.syncPendingOperations()

        assertEquals(listOf("conflict"), queue.operationStates())
        assertTrue(queue.remainingOperationIds().isEmpty())
    }
}

private class FakePendingQueue(
    pending: List<PendingSyncOperation>,
) : PendingOperationQueue {
    private val operations = pending.toMutableList()
    private val states = pending.associate { it.clientOperationId to "pending" }.toMutableMap()

    override suspend fun pendingOperations(): List<PendingSyncOperation> = operations.toList()

    override suspend fun markApplied(clientOperationId: String) {
        operations.removeAll { it.clientOperationId == clientOperationId }
        states[clientOperationId] = "applied"
    }

    override suspend fun markConflict(clientOperationId: String, message: String) {
        operations.removeAll { it.clientOperationId == clientOperationId }
        states[clientOperationId] = "conflict"
    }

    fun remainingOperationIds(): List<String> = operations.map { it.clientOperationId }

    fun operationStates(): List<String> = states.values.toList()
}

private class FakeRemoteSync(
    private val appliedIds: List<String> = emptyList(),
    private val conflictIds: List<String> = emptyList(),
) : RemoteSyncClient {
    val uploadedOperationIds = mutableListOf<String>()

    override suspend fun submit(operations: List<PendingSyncOperation>): RemoteSyncResult {
        uploadedOperationIds += operations.map { it.clientOperationId }
        return RemoteSyncResult(
            applied = operations
                .filter { it.clientOperationId in appliedIds }
                .map { operation ->
                    RemoteSyncApplied(
                        clientOperationId = operation.clientOperationId,
                        entity = operation.entity,
                        localId = operation.localId,
                        serverId = "server-item-1",
                        serverUpdatedAt = "2026-08-05T00:00:00.000Z",
                    )
                },
            conflicts = operations
                .filter { it.clientOperationId in conflictIds }
                .map {
                    RemoteSyncConflict(
                        clientOperationId = it.clientOperationId,
                        message = "Server data changed",
                    )
                },
        )
    }
}
