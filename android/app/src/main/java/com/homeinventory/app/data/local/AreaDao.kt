package com.homeinventory.app.data.local

import androidx.room.Dao
import androidx.room.Insert
import androidx.room.OnConflictStrategy
import androidx.room.Query
import kotlinx.coroutines.flow.Flow

@Dao
interface AreaDao {
    @Query("select * from areas order by localUpdatedAt asc")
    fun observeAll(): Flow<List<AreaEntity>>

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun upsert(area: AreaEntity)

    @Query("update areas set serverId = :serverId, serverUpdatedAt = :serverUpdatedAt, syncStatus = 'synced' where id = :localId")
    suspend fun markSynced(localId: String, serverId: String, serverUpdatedAt: String)

    @Query("delete from areas where id = :localId")
    suspend fun deleteById(localId: String)

    @Query("delete from areas")
    suspend fun clearAll()
}
