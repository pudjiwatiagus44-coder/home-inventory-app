package com.homeinventory.app.data.local

import android.content.Context
import androidx.room.Database
import androidx.room.Room
import androidx.room.RoomDatabase
import androidx.room.Transaction
import androidx.room.migration.Migration
import androidx.sqlite.db.SupportSQLiteDatabase

@Database(
    entities = [
        AreaEntity::class,
        LocationEntity::class,
        ItemEntity::class,
        PendingOperationEntity::class,
        SyncStateEntity::class,
        DraftEntity::class,
    ],
    version = 6,
    exportSchema = false,
)
abstract class AppDatabase : RoomDatabase() {
    abstract fun areaDao(): AreaDao
    abstract fun locationDao(): LocationDao
    abstract fun itemDao(): ItemDao
    abstract fun pendingOperationDao(): PendingOperationDao
    abstract fun syncStateDao(): SyncStateDao
    abstract fun draftDao(): DraftDao

    @Transaction
    suspend fun clearAll() {
        areaDao().clearAll()
        locationDao().clearAll()
        itemDao().clearAll()
        pendingOperationDao().clearAll()
        syncStateDao().put(SyncStateEntity(KEY_LAST_SYNC, ""))
    }

    companion object {
        const val KEY_LAST_SYNC = "last_sync"

        val MIGRATION_2_3 = object : Migration(2, 3) {
            override fun migrate(db: SupportSQLiteDatabase) {
                db.execSQL("ALTER TABLE items ADD COLUMN photoKey TEXT")
            }
        }

        val MIGRATION_3_4 = object : Migration(3, 4) {
            override fun migrate(db: SupportSQLiteDatabase) {
                db.execSQL(
                    """
                    CREATE TABLE IF NOT EXISTS drafts (
                        id TEXT NOT NULL PRIMARY KEY,
                        photoKey TEXT,
                        name TEXT NOT NULL,
                        note TEXT NOT NULL,
                        expireDate TEXT,
                        areaId TEXT,
                        locationId TEXT,
                        status TEXT NOT NULL,
                        createdAt INTEGER NOT NULL
                    )
                    """.trimIndent(),
                )
            }
        }

        val MIGRATION_4_5 = object : Migration(4, 5) {
            override fun migrate(db: SupportSQLiteDatabase) {
                db.execSQL("ALTER TABLE pending_operations ADD COLUMN householdId TEXT")
                db.execSQL(
                    """
                    UPDATE pending_operations
                    SET householdId = (
                        SELECT value
                        FROM sync_state
                        WHERE key = 'current_household_id'
                    )
                    WHERE householdId IS NULL
                    """.trimIndent(),
                )
            }
        }

        val MIGRATION_5_6 = object : Migration(5, 6) {
            override fun migrate(db: SupportSQLiteDatabase) {
                db.execSQL("ALTER TABLE areas ADD COLUMN photoKey TEXT")
                db.execSQL("ALTER TABLE locations ADD COLUMN photoKey TEXT")
            }
        }

        @Volatile
        private var instance: AppDatabase? = null

        fun getInstance(context: Context): AppDatabase =
            instance ?: synchronized(this) {
                instance ?: Room.databaseBuilder(
                    context.applicationContext,
                    AppDatabase::class.java,
                    "home_inventory.db",
                )
                    .addMigrations(MIGRATION_2_3)
                    .addMigrations(MIGRATION_3_4)
                    .addMigrations(MIGRATION_4_5)
                    .addMigrations(MIGRATION_5_6)
                    // v1 从未有真实数据（旧 UI 不写 Room），内测阶段允许重建
                    .fallbackToDestructiveMigration()
                    .build()
                    .also { database ->
                    instance = database
                }
            }
    }
}
