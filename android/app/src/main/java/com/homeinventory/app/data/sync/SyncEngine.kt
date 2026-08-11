package com.homeinventory.app.data.sync

import com.google.gson.JsonParser
import com.homeinventory.app.core.network.HomeInventoryApi
import com.homeinventory.app.data.local.PendingOperationDao
import com.homeinventory.app.data.remote.MobileSyncOperationDto
import com.homeinventory.app.data.remote.MobileSyncRequest
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.coroutines.flow.filter

class SyncEngine(
    private val queue: PendingOperationQueue,
    private val remote: RemoteSyncClient,
    private val onOperationApplied: suspend (RemoteSyncApplied) -> Unit = {},
) {
    suspend fun syncWhenOnline(connectivityObserver: ConnectivityObserver) {
        connectivityObserver.isOnline
            .distinctUntilChanged()
            .filter { isOnline -> isOnline }
            .collect {
                syncPendingOperations()
            }
    }

    suspend fun syncPendingOperations() {
        val operations = queue.pendingOperations()
        if (operations.isEmpty()) return

        val result = remote.submit(operations)
        for (applied in result.applied) {
            queue.markApplied(applied.clientOperationId)
            onOperationApplied(applied)
        }
        for (conflict in result.conflicts) {
            queue.markConflict(conflict.clientOperationId, conflict.message)
        }
    }
}

data class PendingSyncOperation(
    val clientOperationId: String,
    val entity: String,
    val action: String,
    val localId: String,
    val serverId: String?,
    val baseServerUpdatedAt: String?,
    val payloadJson: String,
)

data class RemoteSyncResult(
    val applied: List<RemoteSyncApplied>,
    val conflicts: List<RemoteSyncConflict>,
)

data class RemoteSyncApplied(
    val clientOperationId: String,
    val entity: String,
    val localId: String?,
    val serverId: String,
    val serverUpdatedAt: String?,
)

data class RemoteSyncConflict(
    val clientOperationId: String,
    val message: String,
)

interface PendingOperationQueue {
    suspend fun pendingOperations(): List<PendingSyncOperation>
    suspend fun markApplied(clientOperationId: String)
    suspend fun markConflict(clientOperationId: String, message: String)
}

interface RemoteSyncClient {
    suspend fun submit(operations: List<PendingSyncOperation>): RemoteSyncResult
}

class DaoPendingOperationQueue(
    private val pendingOperationDao: PendingOperationDao,
) : PendingOperationQueue {
    override suspend fun pendingOperations(): List<PendingSyncOperation> =
        pendingOperationDao.pendingOperations().map { operation ->
            PendingSyncOperation(
                clientOperationId = operation.clientOperationId,
                entity = operation.entity,
                action = operation.action,
                localId = operation.localId,
                serverId = operation.serverId,
                baseServerUpdatedAt = operation.baseServerUpdatedAt,
                payloadJson = operation.payloadJson,
            )
        }

    override suspend fun markApplied(clientOperationId: String) {
        pendingOperationDao.markApplied(clientOperationId)
    }

    override suspend fun markConflict(clientOperationId: String, message: String) {
        pendingOperationDao.markConflict(clientOperationId, message)
    }
}

class RetrofitRemoteSyncClient(
    private val api: HomeInventoryApi,
    private val householdIdProvider: () -> String? = { null },
) : RemoteSyncClient {
    override suspend fun submit(operations: List<PendingSyncOperation>): RemoteSyncResult {
        val request = MobileSyncRequest(
            householdId = householdIdProvider(),
            operations = operations.map { operation ->
                MobileSyncOperationDto(
                    clientOperationId = operation.clientOperationId,
                    entity = operation.entity,
                    action = operation.action,
                    localId = operation.localId,
                    serverId = operation.serverId,
                    baseServerUpdatedAt = operation.baseServerUpdatedAt,
                    payload = JsonParser.parseString(operation.payloadJson).asJsonObject,
                )
            },
        )
        val response = api.syncInventory(request)
        if (!response.isSuccessful) {
            throw IllegalStateException(response.body()?.message ?: "Sync failed")
        }

        val results = response.body()?.data?.results.orEmpty()
        return RemoteSyncResult(
            applied = results
                .filter { it.status == "applied" }
                .map {
                    RemoteSyncApplied(
                        clientOperationId = it.clientOperationId,
                        entity = it.entity,
                        localId = it.localId,
                        serverId = it.serverId.orEmpty(),
                        serverUpdatedAt = it.serverUpdatedAt,
                    )
                },
            conflicts = results
                .filter { it.status == "conflict" || it.status == "failed" }
                .map {
                    RemoteSyncConflict(
                        clientOperationId = it.clientOperationId,
                        message = it.message ?: "Sync operation was not applied",
                    )
                },
        )
    }
}
