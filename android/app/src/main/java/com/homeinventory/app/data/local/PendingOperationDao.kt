package com.homeinventory.app.data.local

import androidx.room.Dao
import androidx.room.Insert
import androidx.room.OnConflictStrategy
import androidx.room.Query

@Dao
interface PendingOperationDao {
    @Query("select * from pending_operations where state = 'pending' order by createdAt asc")
    suspend fun pendingOperations(): List<PendingOperationEntity>

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun upsertOperation(operation: PendingOperationEntity)

    @Query("update pending_operations set state = 'applied', errorMessage = null where clientOperationId = :clientOperationId")
    suspend fun markApplied(clientOperationId: String)

    @Query("update pending_operations set state = 'conflict', errorMessage = :message where clientOperationId = :clientOperationId")
    suspend fun markConflict(clientOperationId: String, message: String)
}
