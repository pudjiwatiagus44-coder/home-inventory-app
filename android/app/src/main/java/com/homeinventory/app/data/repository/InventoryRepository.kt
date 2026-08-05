package com.homeinventory.app.data.repository

import com.homeinventory.app.core.network.HomeInventoryApi
import com.google.gson.Gson
import com.google.gson.JsonParser
import com.homeinventory.app.data.local.InventoryDao
import com.homeinventory.app.data.local.InventoryItemEntity
import com.homeinventory.app.data.local.PendingOperationDao
import com.homeinventory.app.data.local.PendingOperationEntity
import com.homeinventory.app.data.remote.RemoteDashboardDto
import java.util.UUID
import okhttp3.ResponseBody

class InventoryRepository(
    private val api: HomeInventoryApi,
    private val inventoryDao: InventoryDao,
    private val pendingOperationDao: PendingOperationDao,
    private val gson: Gson = Gson(),
) {
    suspend fun loadSnapshot(): Result<RemoteDashboardDto> {
        val response = try {
            api.snapshot()
        } catch (_: Exception) {
            return Result.failure(
                IllegalStateException("无法连接服务器，请检查网络"),
            )
        }
        val body = response.body()

        if (!response.isSuccessful) {
            return Result.failure(
                IllegalStateException(parseErrorMessage(response.errorBody()) ?: "加载清单失败"),
            )
        }

        if (body?.ok != true || body.data == null) {
            return Result.failure(
                IllegalStateException(body?.message ?: "加载清单失败"),
            )
        }

        return Result.success(body.data)
    }

    private fun parseErrorMessage(errorBody: ResponseBody?): String? {
        if (errorBody == null) return null

        return try {
            JsonParser.parseString(errorBody.string())
                .asJsonObject["message"]
                ?.asString
        } catch (_: Exception) {
            null
        }
    }

    suspend fun createItemOffline(
        name: String,
        note: String = "",
        expireDate: String? = null,
        locationId: String? = null,
        nowMillis: Long = System.currentTimeMillis(),
    ): InventoryItemEntity {
        val localId = "local-item-${UUID.randomUUID()}"
        val item = InventoryItemEntity.pendingCreate(
            localId = localId,
            name = name,
            note = note,
            expireDate = expireDate,
            locationId = locationId,
            nowMillis = nowMillis,
        )
        val operation = PendingOperationEntity(
            clientOperationId = "op-${UUID.randomUUID()}",
            entity = "item",
            action = "create",
            localId = localId,
            serverId = null,
            baseServerUpdatedAt = null,
            payloadJson = gson.toJson(
                mapOf(
                    "name" to name,
                    "note" to note,
                    "expireDate" to expireDate,
                    "locationId" to locationId,
                ),
            ),
            state = "pending",
            createdAt = nowMillis,
            errorMessage = null,
        )

        inventoryDao.upsertItem(item)
        pendingOperationDao.upsertOperation(operation)

        return item
    }
}
