package com.homeinventory.app.data.local

import android.content.Context
import androidx.room.Database
import androidx.room.Room
import androidx.room.RoomDatabase

@Database(
    entities = [
        AreaEntity::class,
        LocationEntity::class,
        ItemEntity::class,
        PendingOperationEntity::class,
        SyncStateEntity::class,
    ],
    version = 2,
    exportSchema = false,
)
abstract class AppDatabase : RoomDatabase() {
    abstract fun areaDao(): AreaDao
    abstract fun locationDao(): LocationDao
    abstract fun itemDao(): ItemDao
    abstract fun pendingOperationDao(): PendingOperationDao
    abstract fun syncStateDao(): SyncStateDao

    companion object {
        @Volatile
        private var instance: AppDatabase? = null

        fun getInstance(context: Context): AppDatabase =
            instance ?: synchronized(this) {
                instance ?: Room.databaseBuilder(
                    context.applicationContext,
                    AppDatabase::class.java,
                    "home_inventory.db",
                )
                    // v1 从未有真实数据（旧 UI 不写 Room），内测阶段允许重建
                    .fallbackToDestructiveMigration()
                    .build()
                    .also { database ->
                    instance = database
                }
            }
    }
}
