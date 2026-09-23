package com.homeinventory.app.data.local

import androidx.room.Dao
import androidx.room.Insert
import androidx.room.OnConflictStrategy
import androidx.room.Query
import kotlinx.coroutines.flow.Flow

@Dao
interface ItemDao {
    @Query("select * from items order by localUpdatedAt asc")
    fun observeAll(): Flow<List<ItemEntity>>

    @Query("select photoKey from items where photoKey is not null and photoKey != ''")
    suspend fun listPhotoKeys(): List<String>

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun upsert(item: ItemEntity)

    @Query("update items set serverId = :serverId, serverUpdatedAt = :serverUpdatedAt, syncStatus = 'synced' where id = :localId")
    suspend fun markSynced(localId: String, serverId: String, serverUpdatedAt: String)

    @Query("delete from items where id = :localId")
    suspend fun deleteById(localId: String)

    @Query("delete from items")
    suspend fun clearAll()
}
