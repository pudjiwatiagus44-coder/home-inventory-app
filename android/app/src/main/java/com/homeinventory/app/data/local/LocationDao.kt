package com.homeinventory.app.data.local

import androidx.room.Dao
import androidx.room.Insert
import androidx.room.OnConflictStrategy
import androidx.room.Query
import kotlinx.coroutines.flow.Flow

@Dao
interface LocationDao {
    @Query("select * from locations order by localUpdatedAt asc")
    fun observeAll(): Flow<List<LocationEntity>>

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun upsert(location: LocationEntity)

    @Query("update locations set serverId = :serverId, serverUpdatedAt = :serverUpdatedAt, syncStatus = 'synced' where id = :localId")
    suspend fun markSynced(localId: String, serverId: String, serverUpdatedAt: String)

    @Query("delete from locations where id = :localId")
    suspend fun deleteById(localId: String)

    @Query("delete from locations")
    suspend fun clearAll()
}
