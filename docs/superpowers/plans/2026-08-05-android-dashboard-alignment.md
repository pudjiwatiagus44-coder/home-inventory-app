# Android 内测版界面对齐移动网页端与离线同步 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让 Android 内测版实现 session 自动保存/自动登录，并在功能、交互、视觉上与移动网页端一致（区域/位置/物品增删改、搜索、筛选、排序、过期提醒、Excel 导入导出），同时具备离线缓存与离线编辑同步能力。

**Architecture:** 沿用 Kotlin + Jetpack Compose + MVVM。Repository 是唯一数据入口：在线操作调现有 API 并更新 Room，离线操作写 Room 并入 pending_operations，SyncEngine 在网络恢复后提交队列并处理冲突；UI 从 Room 观察，因此在线/离线展示一致。

**Tech Stack:** Jetpack Compose + Material3、Room（5 张表）、Retrofit/OkHttp、EncryptedSharedPreferences（androidx.security:security-crypto）、Apache POI（poi-ooxml，仅导出 xlsx）、core library desugaring。服务端不改代码，复用现有 `/api/auth/*`、`/api/inventory/*`、`/api/mobile/inventory/*`、`/api/inventory/import`。

---

## 前置环境（重要）

- Android 构建**不要用 `gradlew`**（wrapper 要求 Gradle 8.10.2，本机从未下载成功）。使用 scoop 安装的 Gradle 9.6.1：`gradle` 已在 PATH（`C:\Users\Administrator\scoop\shims\gradle.cmd`）。
- 每次构建前设置：`$env:ANDROID_HOME = "C:\Users\Administrator\AppData\Local\Android\Sdk"`。
- Android 工程目录：`android/`（仓库根下）。
- 本地 PostgreSQL 用 `pg_ctl` 重启过，若 `npm test` 集成测试 hook 超时，按 `--no-file-parallelism` 单独跑或清空 `TEST_DATABASE_URL`/`DATABASE_URL` 跑全量。
- 本阶段服务端无代码改动；任务中会跑服务端契约测试做回归确认。

## 文件结构

Android 源码根：`android/app/src/main/java/com/homeinventory/app/`

新增：
- `core/session/EncryptedSessionStore.kt` — EncryptedSharedPreferences 实现 SessionStore
- `core/session/CookieHeaderParser.kt` — 解析 Set-Cookie 的纯 Kotlin 工具（可 JVM 测试）
- `data/local/AreaEntity.kt`、`LocationEntity.kt`、`ItemEntity.kt`、`SyncStateEntity.kt`（放 `entities.kt` 内统一管理）
- `data/local/AreaDao.kt`、`LocationDao.kt`、`ItemDao.kt`、`SyncStateDao.kt`
- `data/sync/AndroidConnectivityObserver.kt` — ConnectivityManager 实现
- `data/excel/ExcelBackupGenerator.kt` — POI 生成 xlsx
- `data/excel/BackupModels.kt` — 导出行模型与文件名
- `ui/theme/Color.kt`、`Theme.kt` — 复刻 Web 视觉 token
- `ui/dashboard/DashboardViewModel.kt`、`DashboardScreen.kt`
- `ui/dashboard/components/TopBar.kt`、`AreaStrip.kt`、`LocationStrip.kt`、`ItemList.kt`、`FloatingAddButton.kt`
- `ui/dashboard/dialogs/SearchDialog.kt`、`ItemFormDialog.kt`、`LocationFormDialog.kt`、`AreaFormDialog.kt`、`ImportPreviewDialog.kt`
- `ui/dashboard/InventoryFormValidation.kt` — 表单校验纯 Kotlin
- `data/repository/ImportExportRepository.kt` — 导入上传/提交、导出文件生成与落盘
- `data/repository/SyncResult.kt` — 同步结果模型

修改：
- `core/network/HomeInventoryApi.kt` — 增加 CRUD、import multipart、commit 接口
- `data/local/AppDatabase.kt` — v2：五张表 + fallbackToDestructiveMigration（v1 从未有真实数据）
- `data/local/entities.kt` — 替换为 v2 实体
- `data/local/InventoryDao.kt` — 删除（拆为 AreaDao/LocationDao/ItemDao）
- `data/repository/AuthRepository.kt` — 不变（SessionStore 由调用方换成 Encrypted 实现）
- `data/repository/InventoryRepository.kt` — 重写为完整仓库
- `data/sync/SyncEngine.kt` — 扩展为三种实体三种动作 + 应用结果回调
- `ui/AppRoot.kt` — 自动登录 + 主界面路由
- `ui/inventory/` — 删除旧 InventoryScreen/InventoryViewModel（被 dashboard 取代）
- `ui/login/LoginScreen.kt` — 保留，微调进入逻辑
- `HomeInventoryApplication.kt` — 提供 AppDatabase 与 SessionStore 单例
- `app/build.gradle.kts` — 新增依赖（security-crypto、poi、desugar）、compileOptions 开 desugaring

测试（`android/app/src/test/java/com/homeinventory/app/`）：
- `core/session/CookieHeaderParserTest.kt`
- `data/excel/ExcelBackupGeneratorTest.kt`
- `data/repository/InventoryRepositoryTest.kt`（重写）
- `data/sync/SyncEngineTest.kt`（扩展）
- `ui/dashboard/DashboardViewModelTest.kt`
- `ui/dashboard/InventoryFormValidationTest.kt`
- `data/repository/ImportExportRepositoryTest.kt`（契约解析部分）

---

## 阶段 1：会话层（自动保存与自动登录）

### Task 1: Cookie 解析工具（纯 Kotlin，TDD）

**Files:**
- Create: `android/app/src/main/java/com/homeinventory/app/core/session/CookieHeaderParser.kt`
- Test: `android/app/src/test/java/com/homeinventory/app/core/session/CookieHeaderParserTest.kt`

- [ ] **Step 1: 写失败测试**

```kotlin
package com.homeinventory.app.core.session

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class CookieHeaderParserTest {
    @Test
    fun extractsHomeInventorySessionFromSetCookieHeader() {
        val cookie = CookieHeaderParser.parse(
            "home_inventory_session=abc123; Path=/; HttpOnly",
        )
        assertEquals("home_inventory_session=abc123", cookie)
    }

    @Test
    fun returnsNullWhenHeaderHasNoSessionCookie() {
        assertNull(CookieHeaderParser.parse("other=value; Path=/"))
    }

    @Test
    fun returnsNullWhenHeaderIsBlank() {
        assertNull(CookieHeaderParser.parse(""))
        assertNull(CookieHeaderParser.parse(null))
    }
}
```

- [ ] **Step 2: 运行测试确认失败**

Run: `gradle :app:testDebugUnitTest --tests "com.homeinventory.app.core.session.CookieHeaderParserTest" --no-daemon`
Expected: FAIL（`CookieHeaderParser` 不存在）

- [ ] **Step 3: 最小实现**

```kotlin
package com.homeinventory.app.core.session

object CookieHeaderParser {
    fun parse(setCookieHeader: String?): String? {
        if (setCookieHeader.isNullOrBlank()) return null
        val first = setCookieHeader.substringBefore(";").trim()
        return first.takeIf { it.startsWith("home_inventory_session=") }
    }
}
```

- [ ] **Step 4: 运行测试确认通过**

Run: 同上命令
Expected: PASS

- [ ] **Step 5: 提交**

```bash
git add android/app/src/main/java/com/homeinventory/app/core/session/CookieHeaderParser.kt android/app/src/test/java/com/homeinventory/app/core/session/CookieHeaderParserTest.kt
git commit -m "feat: parse session cookie header"
```

### Task 2: EncryptedSharedPreferences SessionStore

**Files:**
- Create: `android/app/src/main/java/com/homeinventory/app/core/session/EncryptedSessionStore.kt`
- Modify: `android/app/src/main/java/com/homeinventory/app/core/session/SessionStore.kt`（保持接口不变）
- Modify: `android/app/build.gradle.kts`（加 `androidx.security:security-crypto:1.1.0-alpha06`）

- [ ] **Step 1: 加依赖**

`android/app/build.gradle.kts` 的 `dependencies` 块加：

```kotlin
implementation("androidx.security:security-crypto:1.1.0-alpha06")
```

- [ ] **Step 2: 实现（Android 薄层，逻辑已在 Task 1 覆盖）**

```kotlin
package com.homeinventory.app.core.session

import android.content.Context
import android.content.SharedPreferences
import androidx.security.crypto.EncryptedSharedPreferences
import androidx.security.crypto.MasterKey

class EncryptedSessionStore(context: Context) : SessionStore {
    private val preferences: SharedPreferences = run {
        val masterKey = MasterKey.Builder(context)
            .setKeyScheme(MasterKey.KeyScheme.AES256_GCM)
            .build()
        EncryptedSharedPreferences.create(
            context,
            "home_inventory_session_store",
            masterKey,
            EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,
            EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM,
        )
    }

    override fun saveSessionCookie(setCookieHeader: String) {
        val cookie = CookieHeaderParser.parse(setCookieHeader) ?: return
        preferences.edit().putString(KEY_SESSION_COOKIE, cookie).apply()
    }

    override fun sessionCookie(): String? =
        preferences.getString(KEY_SESSION_COOKIE, null)

    override fun clear() {
        preferences.edit().remove(KEY_SESSION_COOKIE).apply()
    }

    private companion object {
        const val KEY_SESSION_COOKIE = "home_inventory_session"
    }
}
```

- [ ] **Step 3: 构建验证**

Run: `gradle :app:compileDebugKotlin --no-daemon`
Expected: BUILD SUCCESSFUL

- [ ] **Step 4: 提交**

```bash
git add android/app/build.gradle.kts android/app/src/main/java/com/homeinventory/app/core/session/EncryptedSessionStore.kt
git commit -m "feat: persist session cookie with encrypted storage"
```

### Task 3: App 启动自动登录路由

**Files:**
- Modify: `android/app/src/main/java/com/homeinventory/app/HomeInventoryApplication.kt`
- Modify: `android/app/src/main/java/com/homeinventory/app/ui/AppRoot.kt`
- Test: `android/app/src/test/java/com/homeinventory/app/core/session/SessionStoreTest.kt`（扩展，验证「保存后能读出、清除后为空」的 Fake 行为）

- [ ] **Step 1: 写失败测试（Fake SessionStore 自动登录判定）**

```kotlin
package com.homeinventory.app.core.session

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class SessionStoreTest {
    @Test
    fun storesCookieWithoutStoringPassword() {
        val store = InMemorySessionStore()
        store.saveSessionCookie("home_inventory_session=abc; Path=/; HttpOnly")
        assertEquals("home_inventory_session=abc", store.sessionCookie())
        assertNull(store.rawPasswordForTest())
    }

    @Test
    fun ignoresHeadersWithoutSessionCookie() {
        val store = InMemorySessionStore()
        store.saveSessionCookie("other=value; Path=/")
        assertNull(store.sessionCookie())
    }
}
```

同时把 `InMemorySessionStore.saveSessionCookie` 改为复用 `CookieHeaderParser.parse`（一行改动）。

- [ ] **Step 2: 运行测试确认失败**

Run: `gradle :app:testDebugUnitTest --tests "com.homeinventory.app.core.session.SessionStoreTest" --no-daemon`
Expected: `ignoresHeadersWithoutSessionCookie` FAIL（当前实现会保存 `other=value`）

- [ ] **Step 3: 修改 InMemorySessionStore 并让测试通过**

`SessionStore.kt` 中：

```kotlin
class InMemorySessionStore : SessionStore {
    private var cookie: String? = null

    override fun saveSessionCookie(setCookieHeader: String) {
        cookie = CookieHeaderParser.parse(setCookieHeader)
    }

    override fun sessionCookie(): String? = cookie

    override fun clear() {
        cookie = null
    }

    fun rawPasswordForTest(): String? = null
}
```

- [ ] **Step 4: 运行测试确认通过**

Run: 同上命令
Expected: PASS

- [ ] **Step 5: HomeInventoryApplication 提供单例**

```kotlin
package com.homeinventory.app

import android.app.Application
import com.homeinventory.app.core.session.EncryptedSessionStore
import com.homeinventory.app.core.session.SessionStore
import com.homeinventory.app.data.local.AppDatabase

class HomeInventoryApplication : Application() {
    val database: AppDatabase by lazy { AppDatabase.getInstance(this) }
    val sessionStore: SessionStore by lazy { EncryptedSessionStore(this) }
}
```

- [ ] **Step 6: AppRoot 自动登录逻辑（先接「有 cookie 直接进清单页」，数据加载在阶段 2 补齐）**

`ui/AppRoot.kt` 中 `var isLoggedIn by remember { mutableStateOf(sessionStore.sessionCookie() != null) }` 保持不变；把 `sessionStore` 改为从 Application 取：

```kotlin
val app = LocalContext.current.applicationContext as HomeInventoryApplication
val sessionStore = app.sessionStore
```

其余保持现有结构（登录成功 `viewModel.refreshFromServer()`、退出 `authRepository.logout()` 后 `sessionStore.clear()` + 回登录页）。退出清理在阶段 2 的 Task 8 统一接线。

- [ ] **Step 7: 构建验证并提交**

Run: `gradle :app:assembleDebug --no-daemon`
Expected: BUILD SUCCESSFUL

```bash
git add android/app/src/main/java/com/homeinventory/app/HomeInventoryApplication.kt android/app/src/main/java/com/homeinventory/app/ui/AppRoot.kt android/app/src/main/java/com/homeinventory/app/core/session/SessionStore.kt android/app/src/test/java/com/homeinventory/app/core/session/SessionStoreTest.kt
git commit -m "feat: auto login routing with persisted session"
```

---

## 阶段 2：数据与同步层

### Task 4: Room v2 五张表

**Files:**
- Modify: `android/app/src/main/java/com/homeinventory/app/data/local/entities.kt`（替换为 v2 实体）
- Create: `android/app/src/main/java/com/homeinventory/app/data/local/AreaDao.kt`
- Create: `android/app/src/main/java/com/homeinventory/app/data/local/LocationDao.kt`
- Create: `android/app/src/main/java/com/homeinventory/app/data/local/ItemDao.kt`
- Create: `android/app/src/main/java/com/homeinventory/app/data/local/SyncStateDao.kt`
- Delete: `android/app/src/main/java/com/homeinventory/app/data/local/InventoryDao.kt`
- Modify: `android/app/src/main/java/com/homeinventory/app/data/local/AppDatabase.kt`
- Modify: `android/app/src/main/java/com/homeinventory/app/data/local/PendingOperationDao.kt`（追加 `clearAll`）

- [ ] **Step 1: 写实体（无 JVM 测试，Room 编译期校验；用 `gradle :app:kspDebugKotlin` 验证）**

`entities.kt` 完整替换：

```kotlin
package com.homeinventory.app.data.local

import androidx.room.Entity
import androidx.room.PrimaryKey

object SyncStatus {
    const val Synced = "synced"
    const val PendingCreate = "pending_create"
    const val PendingUpdate = "pending_update"
    const val PendingDelete = "pending_delete"
    const val Conflict = "conflict"
}

@Entity(tableName = "areas")
data class AreaEntity(
    @PrimaryKey val id: String,
    val serverId: String?,
    val name: String,
    val color: String,
    val serverUpdatedAt: String?,
    val localUpdatedAt: Long,
    val syncStatus: String,
)

@Entity(tableName = "locations")
data class LocationEntity(
    @PrimaryKey val id: String,
    val serverId: String?,
    val areaId: String?,
    val name: String,
    val serverUpdatedAt: String?,
    val localUpdatedAt: Long,
    val syncStatus: String,
)

@Entity(tableName = "items")
data class ItemEntity(
    @PrimaryKey val id: String,
    val serverId: String?,
    val locationId: String?,
    val name: String,
    val note: String,
    val expireDate: String?,
    val serverUpdatedAt: String?,
    val localUpdatedAt: Long,
    val syncStatus: String,
) {
    companion object {
        fun pendingCreate(
            localId: String,
            name: String,
            note: String,
            expireDate: String?,
            locationId: String?,
            nowMillis: Long = System.currentTimeMillis(),
        ) = ItemEntity(
            id = localId,
            serverId = null,
            locationId = locationId,
            name = name,
            note = note,
            expireDate = expireDate,
            serverUpdatedAt = null,
            localUpdatedAt = nowMillis,
            syncStatus = SyncStatus.PendingCreate,
        )
    }
}

@Entity(tableName = "sync_state")
data class SyncStateEntity(
    @PrimaryKey val key: String,
    val value: String,
)

@Entity(tableName = "pending_operations")
data class PendingOperationEntity(
    @PrimaryKey val clientOperationId: String,
    val entity: String,
    val action: String,
    val localId: String,
    val serverId: String?,
    val baseServerUpdatedAt: String?,
    val payloadJson: String,
    val state: String,
    val createdAt: Long,
    val errorMessage: String?,
)
```

- [ ] **Step 2: 写 DAO**

`AreaDao.kt`：

```kotlin
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
```

`LocationDao.kt`（同模式：`observeAll`、`upsert`、`markSynced(localId, serverId, serverUpdatedAt)`、`deleteById`、`clearAll`）。

`ItemDao.kt`（同模式，字段含 note/expireDate/locationId）。

`SyncStateDao.kt`：

```kotlin
package com.homeinventory.app.data.local

import androidx.room.Dao
import androidx.room.Insert
import androidx.room.OnConflictStrategy
import androidx.room.Query

@Dao
interface SyncStateDao {
    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun put(state: SyncStateEntity)

    @Query("select value from sync_state where key = :key")
    suspend fun get(key: String): String?
}
```

`PendingOperationDao.kt` 追加：

```kotlin
@Query("delete from pending_operations")
suspend fun clearAll()
```

- [ ] **Step 3: AppDatabase v2**

```kotlin
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
                    .also { database -> instance = database }
            }
    }
}
```

同时删除 `InventoryDao.kt`，更新 `HomeInventoryApplication` 中 db 暴露（保留 `database` 属性即可）。

- [ ] **Step 4: 构建验证**

Run: `gradle :app:kspDebugKotlin :app:compileDebugKotlin --no-daemon`
Expected: BUILD SUCCESSFUL

- [ ] **Step 5: 提交**

```bash
git add android/app/src/main/java/com/homeinventory/app/data/local/
git commit -m "feat: room v2 with five tables"
```

### Task 5: API 客户端扩展（CRUD + 导入）

**Files:**
- Modify: `android/app/src/main/java/com/homeinventory/app/core/network/HomeInventoryApi.kt`
- Modify: `android/app/src/main/java/com/homeinventory/app/data/remote/dto.kt`

- [ ] **Step 1: 扩展 DTO（dto.kt 追加）**

```kotlin
data class AreaCreateRequest(val name: String, val color: String? = null)
data class AreaUpdateRequest(val name: String, val color: String? = null)
data class LocationCreateRequest(val name: String, val areaId: String? = null)
data class LocationUpdateRequest(val name: String, val areaId: String? = null)
data class ItemCreateRequest(
    val name: String,
    val note: String = "",
    val expireDate: String? = null,
    val locationId: String? = null,
)
data class ItemUpdateRequest(
    val name: String,
    val note: String = "",
    val expireDate: String? = null,
    val locationId: String? = null,
)

data class ImportRowDto(
    val index: Int,
    val name: String,
    val locationName: String,
    val areaName: String,
    val note: String,
    val expireDate: String?,
)

data class ImportConflictExistingDto(
    val id: String,
    val name: String,
    val note: String,
    val expireDate: String?,
    val locationName: String,
    val areaName: String,
)

data class ImportConflictDto(
    val id: String,
    val row: ImportRowDto,
    val existingItem: ImportConflictExistingDto,
)

data class ImportSkippedDto(
    val row: Int,
    val reason: String,
)

data class ImportErrorDto(
    val row: Int,
    val message: String,
)

data class ImportPreviewDto(
    val rows: List<ImportRowDto> = emptyList(),
    val creates: List<ImportRowDto> = emptyList(),
    val skipped: List<ImportSkippedDto> = emptyList(),
    val conflicts: List<ImportConflictDto> = emptyList(),
    val errors: List<ImportErrorDto> = emptyList(),
)

data class ImportCommitRequest(
    val rows: List<ImportRowDto>,
    val conflictResolutions: Map<String, String>,
)

data class ImportSummaryDto(
    val createdAreas: Int = 0,
    val createdLocations: Int = 0,
    val createdItems: Int = 0,
    val keptConflictItems: Int = 0,
    val overwrittenItems: Int = 0,
    val skippedItems: Int = 0,
    val errors: List<ImportErrorDto> = emptyList(),
)
```

注意：`creates` 数组元素在服务端是 `{row: InventoryBackupRow}` 结构，Gson 解析时直接映射为 `ImportRowDto` 会失败（实际是 `{"row":{...}}`）。为稳妥，preview 的 creates 改用：

```kotlin
data class ImportCreateDto(val row: ImportRowDto? = null)

data class ImportPreviewDto(
    val rows: List<ImportRowDto> = emptyList(),
    val creates: List<ImportCreateDto> = emptyList(),
    val skipped: List<ImportSkippedDto> = emptyList(),
    val conflicts: List<ImportConflictDto> = emptyList(),
    val errors: List<ImportErrorDto> = emptyList(),
)
```

- [ ] **Step 2: 扩展 HomeInventoryApi**

```kotlin
@POST("api/inventory/areas")
suspend fun createArea(@Body request: AreaCreateRequest): Response<ApiEnvelope<RemoteAreaDto>>

@PATCH("api/inventory/areas/{areaId}")
suspend fun updateArea(
    @Path("areaId") areaId: String,
    @Body request: AreaUpdateRequest,
): Response<ApiEnvelope<RemoteAreaDto>>

@DELETE("api/inventory/areas/{areaId}")
suspend fun deleteArea(@Path("areaId") areaId: String): Response<ApiEnvelope<Unit>>

@POST("api/inventory/locations")
suspend fun createLocation(@Body request: LocationCreateRequest): Response<ApiEnvelope<RemoteLocationDto>>

@PATCH("api/inventory/locations/{locationId}")
suspend fun updateLocation(
    @Path("locationId") locationId: String,
    @Body request: LocationUpdateRequest,
): Response<ApiEnvelope<RemoteLocationDto>>

@DELETE("api/inventory/locations/{locationId}")
suspend fun deleteLocation(@Path("locationId") locationId: String): Response<ApiEnvelope<Unit>>

@POST("api/inventory/items")
suspend fun createItem(@Body request: ItemCreateRequest): Response<ApiEnvelope<RemoteItemDto>>

@PATCH("api/inventory/items/{itemId}")
suspend fun updateItem(
    @Path("itemId") itemId: String,
    @Body request: ItemUpdateRequest,
): Response<ApiEnvelope<RemoteItemDto>>

@DELETE("api/inventory/items/{itemId}")
suspend fun deleteItem(@Path("itemId") itemId: String): Response<ApiEnvelope<Unit>>

@Multipart
@POST("api/inventory/import")
suspend fun previewImport(
    @Part file: MultipartBody.Part,
): Response<ApiEnvelope<ImportPreviewDto>>

@POST("api/inventory/import?mode=commit")
suspend fun commitImport(@Body request: ImportCommitRequest): Response<ApiEnvelope<ImportSummaryDto>>
```

补齐 imports：`okhttp3.MultipartBody`、`retrofit2.http.*`。

- [ ] **Step 3: 构建验证**

Run: `gradle :app:compileDebugKotlin --no-daemon`
Expected: BUILD SUCCESSFUL

- [ ] **Step 4: 提交**

```bash
git add android/app/src/main/java/com/homeinventory/app/core/network/HomeInventoryApi.kt android/app/src/main/java/com/homeinventory/app/data/remote/dto.kt
git commit -m "feat: inventory crud and import api client"
```

### Task 6: 快照落库与观察（InventoryRepository 第一部分）

**Files:**
- Modify: `android/app/src/main/java/com/homeinventory/app/data/repository/InventoryRepository.kt`
- Create: `android/app/src/main/java/com/homeinventory/app/data/repository/InventorySnapshot.kt`
- Test: `android/app/src/test/java/com/homeinventory/app/data/repository/InventoryRepositoryTest.kt`

- [ ] **Step 1: 定义快照模型（新文件）**

```kotlin
package com.homeinventory.app.data.repository

data class InventorySnapshot(
    val areas: List<AreaView> = emptyList(),
    val locations: List<LocationView> = emptyList(),
    val items: List<ItemView> = emptyList(),
) {
    data class AreaView(
        val id: String,
        val name: String,
        val color: String,
        val syncStatus: String,
    )

    data class LocationView(
        val id: String,
        val name: String,
        val areaId: String?,
        val syncStatus: String,
    )

    data class ItemView(
        val id: String,
        val name: String,
        val note: String,
        val expireDate: String?,
        val locationId: String?,
        val areaId: String?,
        val locationName: String?,
        val syncStatus: String,
    )
}
```

- [ ] **Step 2: 写失败测试（快照落库 + 观察合并）**

`InventoryRepositoryTest.kt`（先写 `loadSnapshot` 相关失败测试，沿用已有 Fake DAO 模式，新增 AreaDao/LocationDao/ItemDao/SyncStateDao Fake）：

```kotlin
@Test
fun refreshSnapshotWritesServerDataToRoom() = runTest {
    val dashboard = RemoteDashboardDto(
        household = RemoteHouseholdDto(id = "household-1", name = "我的家"),
        areas = listOf(RemoteAreaDto(id = "area-1", name = "厨房", color = "#ff0000")),
        locations = listOf(RemoteLocationDto(id = "location-1", name = "冰箱", areaId = "area-1")),
        items = listOf(
            RemoteItemDto(
                id = "item-1",
                name = "牛奶",
                note = "",
                expireDate = null,
                locationId = "location-1",
            ),
        ),
    )
    val api = FakeSnapshotApi(Response.success(ApiEnvelope(ok = true, data = dashboard)))
    val repository = InventoryRepository(
        api = api,
        areaDao = FakeAreaDao(),
        locationDao = FakeLocationDao(),
        itemDao = FakeItemDao(),
        pendingOperationDao = FakePendingOperationDao(),
        syncStateDao = FakeSyncStateDao(),
    )

    val result = repository.refreshSnapshot()

    assertTrue(result.isSuccess)
    val snapshot = repository.observeInventory().first()
    assertEquals(1, snapshot.areas.size)
    assertEquals("厨房", snapshot.areas[0].name)
    assertEquals("冰箱", snapshot.items.first().locationName)
}
```

（Fake DAO 用 `MutableStateFlow` 保存插入数据，`observeAll()` 返回对应 Flow；Fake `api.snapshot()` 返回上面 dashboard。）

- [ ] **Step 3: 运行测试确认失败**

Run: `gradle :app:testDebugUnitTest --tests "com.homeinventory.app.data.repository.InventoryRepositoryTest" --no-daemon`
Expected: FAIL（`refreshSnapshot`、`observeInventory` 不存在 / 构造函数不匹配）

- [ ] **Step 4: 重写 InventoryRepository（本任务先实现观察 + 快照，CRUD 在 Task 7 追加）**

```kotlin
package com.homeinventory.app.data.repository

import com.homeinventory.app.core.network.HomeInventoryApi
import com.homeinventory.app.data.local.AreaDao
import com.homeinventory.app.data.local.AreaEntity
import com.homeinventory.app.data.local.ItemDao
import com.homeinventory.app.data.local.ItemEntity
import com.homeinventory.app.data.local.LocationDao
import com.homeinventory.app.data.local.LocationEntity
import com.homeinventory.app.data.local.PendingOperationDao
import com.homeinventory.app.data.local.SyncStatus
import com.homeinventory.app.data.local.SyncStateDao
import com.homeinventory.app.data.remote.RemoteDashboardDto
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.combine

class InventoryRepository(
    private val api: HomeInventoryApi,
    private val areaDao: AreaDao,
    private val locationDao: LocationDao,
    private val itemDao: ItemDao,
    private val pendingOperationDao: PendingOperationDao,
    private val syncStateDao: SyncStateDao,
) {
    fun observeInventory(): Flow<InventorySnapshot> =
        combine(areaDao.observeAll(), locationDao.observeAll(), itemDao.observeAll()) { areas, locations, items ->
            val locationNames = locations.associate { it.id to it.name }
            val areaIds = locations.associate { it.id to it.areaId }
            InventorySnapshot(
                areas = areas.map { InventorySnapshot.AreaView(it.id, it.name, it.color, it.syncStatus) },
                locations = locations.map {
                    InventorySnapshot.LocationView(it.id, it.name, it.areaId, it.syncStatus)
                },
                items = items.map {
                    InventorySnapshot.ItemView(
                        id = it.id,
                        name = it.name,
                        note = it.note,
                        expireDate = it.expireDate,
                        locationId = it.locationId,
                        areaId = it.locationId?.let { id -> areaIds[id] },
                        locationName = it.locationId?.let { id -> locationNames[id] },
                        syncStatus = it.syncStatus,
                    )
                },
            )
        }

    suspend fun refreshSnapshot(): Result<Unit> {
        val response = try {
            api.snapshot()
        } catch (_: Exception) {
            return Result.failure(IllegalStateException("无法连接服务器，请检查网络"))
        }
        val body = response.body()
        if (!response.isSuccessful || body?.ok != true || body.data == null) {
            return Result.failure(
                IllegalStateException(parseErrorMessage(response.errorBody()) ?: body?.message ?: "加载清单失败"),
            )
        }
        replaceServerData(body.data)
        syncStateDao.put(com.homeinventory.app.data.local.SyncStateEntity(KEY_LAST_SYNC, System.currentTimeMillis().toString()))
        return Result.success(Unit)
    }

    private suspend fun replaceServerData(dashboard: RemoteDashboardDto) {
        areaDao.clearAll()
        locationDao.clearAll()
        itemDao.clearAll()
        dashboard.areas.forEach { area ->
            areaDao.upsert(
                AreaEntity(
                    id = area.id,
                    serverId = area.id,
                    name = area.name,
                    color = area.color,
                    serverUpdatedAt = area.updatedAt,
                    localUpdatedAt = System.currentTimeMillis(),
                    syncStatus = SyncStatus.Synced,
                ),
            )
        }
        dashboard.locations.forEach { location ->
            locationDao.upsert(
                LocationEntity(
                    id = location.id,
                    serverId = location.id,
                    areaId = location.areaId,
                    name = location.name,
                    serverUpdatedAt = location.updatedAt,
                    localUpdatedAt = System.currentTimeMillis(),
                    syncStatus = SyncStatus.Synced,
                ),
            )
        }
        dashboard.items.forEach { item ->
            itemDao.upsert(
                ItemEntity(
                    id = item.id,
                    serverId = item.id,
                    locationId = item.locationId,
                    name = item.name,
                    note = item.note,
                    expireDate = item.expireDate,
                    serverUpdatedAt = item.updatedAt,
                    localUpdatedAt = System.currentTimeMillis(),
                    syncStatus = SyncStatus.Synced,
                ),
            )
        }
    }

    private fun parseErrorMessage(errorBody: okhttp3.ResponseBody?): String? {
        if (errorBody == null) return null
        return try {
            com.google.gson.JsonParser.parseString(errorBody.string())
                .asJsonObject["message"]?.asString
        } catch (_: Exception) {
            null
        }
    }

    private companion object {
        const val KEY_LAST_SYNC = "last_sync"
    }
}
```

- [ ] **Step 5: 运行测试确认通过**

Run: 同 Step 2 命令
Expected: PASS

- [ ] **Step 6: 提交**

```bash
git add android/app/src/main/java/com/homeinventory/app/data/repository/InventoryRepository.kt android/app/src/main/java/com/homeinventory/app/data/repository/InventorySnapshot.kt android/app/src/test/java/com/homeinventory/app/data/repository/InventoryRepositoryTest.kt
git commit -m "feat: inventory snapshot to room and observe"
```

### Task 7: 在线与离线 CRUD 仓库方法

**Files:**
- Modify: `android/app/src/main/java/com/homeinventory/app/data/repository/InventoryRepository.kt`
- Test: `android/app/src/test/java/com/homeinventory/app/data/repository/InventoryRepositoryTest.kt`

- [ ] **Step 1: 写失败测试（离线新增入队 + 在线新增走 API）**

```kotlin
@Test
fun offlineCreateItemWritesRoomAndQueuesOperation() = runTest {
    val repository = InventoryRepository(
        api = FakeSnapshotApi(Response.success(ApiEnvelope(ok = true, data = RemoteDashboardDto()))),
        areaDao = FakeAreaDao(),
        locationDao = FakeLocationDao(),
        itemDao = FakeItemDao(),
        pendingOperationDao = FakePendingOperationDao(),
        syncStateDao = FakeSyncStateDao(),
    )

    val created = repository.createItemOffline(
        name = "离线牛奶",
        note = "",
        expireDate = null,
        locationId = null,
    )

    assertEquals("pending_create", created.syncStatus)
    assertEquals(1, repository.observeInventory().first().items.size)
    assertEquals(1, repository.pendingOperations().size)
}

@Test
fun onlineCreateItemCallsApiAndWritesRoom() = runTest {
    val api = RecordingApi()
    val repository = InventoryRepository(
        api = api,
        areaDao = FakeAreaDao(),
        locationDao = FakeLocationDao(),
        itemDao = FakeItemDao(),
        pendingOperationDao = FakePendingOperationDao(),
        syncStateDao = FakeSyncStateDao(),
    )

    val result = repository.createItemOnline(
        name = "牛奶",
        note = "",
        expireDate = null,
        locationId = "location-1",
    )

    assertTrue(result.isSuccess)
    assertEquals(1, api.createdItems)
}
```

（`RecordingApi` 记录调用；`FakePendingOperationDao` 暴露 `pendingOperations()` 快照与 `clearAll`。）

- [ ] **Step 2: 运行测试确认失败**

Run: `gradle :app:testDebugUnitTest --tests "com.homeinventory.app.data.repository.InventoryRepositoryTest" --no-daemon`
Expected: FAIL（方法不存在）

- [ ] **Step 3: 实现 CRUD 方法（追加到 InventoryRepository）**

```kotlin
suspend fun createItemOnline(
    name: String,
    note: String,
    expireDate: String?,
    locationId: String?,
): Result<Unit> = runOnlineMutation(
    request = { api.createItem(ItemCreateRequest(name, note, expireDate, locationId)) },
    onSuccess = { remoteItem ->
        itemDao.upsert(
            ItemEntity(
                id = remoteItem.id,
                serverId = remoteItem.id,
                locationId = remoteItem.locationId,
                name = remoteItem.name,
                note = remoteItem.note,
                expireDate = remoteItem.expireDate,
                serverUpdatedAt = remoteItem.updatedAt,
                localUpdatedAt = System.currentTimeMillis(),
                syncStatus = SyncStatus.Synced,
            ),
        )
    },
)

suspend fun updateItemOnline(
    serverId: String,
    name: String,
    note: String,
    expireDate: String?,
    locationId: String?,
): Result<Unit> = runOnlineMutation(
    request = { api.updateItem(serverId, ItemUpdateRequest(name, note, expireDate, locationId)) },
    onSuccess = { remoteItem ->
        itemDao.upsert(
            ItemEntity(
                id = remoteItem.id,
                serverId = remoteItem.id,
                locationId = remoteItem.locationId,
                name = remoteItem.name,
                note = remoteItem.note,
                expireDate = remoteItem.expireDate,
                serverUpdatedAt = remoteItem.updatedAt,
                localUpdatedAt = System.currentTimeMillis(),
                syncStatus = SyncStatus.Synced,
            ),
        )
    },
)

suspend fun deleteItemOnline(serverId: String): Result<Unit> = runOnlineMutation(
    request = { api.deleteItem(serverId) },
    onSuccess = { itemDao.deleteById(serverId) },
)

suspend fun createItemOffline(
    name: String,
    note: String,
    expireDate: String?,
    locationId: String?,
    nowMillis: Long = System.currentTimeMillis(),
): ItemEntity {
    val localId = "local-item-${UUID.randomUUID()}"
    val item = ItemEntity.pendingCreate(localId, name, note, expireDate, locationId, nowMillis)
    itemDao.upsert(item)
    pendingOperationDao.upsertOperation(
        PendingOperationEntity(
            clientOperationId = "op-${UUID.randomUUID()}",
            entity = "item",
            action = "create",
            localId = localId,
            serverId = null,
            baseServerUpdatedAt = null,
            payloadJson = gson.toJson(mapOf("name" to name, "note" to note, "expireDate" to expireDate, "locationId" to locationId)),
            state = "pending",
            createdAt = nowMillis,
            errorMessage = null,
        ),
    )
    return item
}

suspend fun pendingOperations(): List<PendingOperationEntity> =
    pendingOperationDao.pendingOperations()

private suspend inline fun <T> runOnlineMutation(
    request: () -> retrofit2.Response<T>,
    onSuccess: (T) -> Unit,
): Result<Unit> {
    val response = try {
        request()
    } catch (_: Exception) {
        return Result.failure(IllegalStateException("无法连接服务器，请检查网络"))
    }
    val body = response.body()
    if (!response.isSuccessful) {
        return Result.failure(IllegalStateException(parseErrorMessage(response.errorBody()) ?: "操作失败"))
    }
    if (body == null) {
        return Result.failure(IllegalStateException("操作失败"))
    }
    onSuccess(body)
    return Result.success(Unit)
}
```

区域与位置的方法按同一模式实现：

```kotlin
suspend fun createAreaOnline(name: String, color: String?): Result<Unit>
suspend fun updateAreaOnline(serverId: String, name: String, color: String?): Result<Unit>
suspend fun deleteAreaOnline(serverId: String): Result<Unit>
suspend fun createAreaOffline(name: String, color: String): AreaEntity
suspend fun createLocationOnline(name: String, areaId: String?): Result<Unit>
suspend fun updateLocationOnline(serverId: String, name: String, areaId: String?): Result<Unit>
suspend fun deleteLocationOnline(serverId: String): Result<Unit>
suspend fun createLocationOffline(name: String, areaId: String?): LocationEntity
```

离线新增统一规则：`local-<entity>-<UUID>` 本地 id、`pending_create`、payloadJson 存业务字段、入队。离线更新/删除在 Task 8 与 SyncEngine 一起实现。

- [ ] **Step 4: 运行测试确认通过**

Run: 同 Step 2 命令
Expected: PASS

- [ ] **Step 5: 提交**

```bash
git add android/app/src/main/java/com/homeinventory/app/data/repository/InventoryRepository.kt android/app/src/test/java/com/homeinventory/app/data/repository/InventoryRepositoryTest.kt
git commit -m "feat: online and offline create operations"
```

### Task 8: 同步引擎扩展与冲突处理

**Files:**
- Modify: `android/app/src/main/java/com/homeinventory/app/data/sync/SyncEngine.kt`
- Modify: `android/app/src/main/java/com/homeinventory/app/data/repository/InventoryRepository.kt`（加 `syncPendingOperations` 与离线 update/delete）
- Test: `android/app/src/test/java/com/homeinventory/app/data/sync/SyncEngineTest.kt`（扩展）

- [ ] **Step 1: 写失败测试（离线更新/删除入队；同步后应用服务端 id；冲突保留）**

```kotlin
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
    val remote = FakeRemoteSync(appliedIds = listOf("server-item-1"))
    val engine = SyncEngine(
        queue = queue,
        remote = remote,
        onOperationApplied = { applied += it },
    )

    engine.syncPendingOperations()

    assertEquals(emptyList<String>(), queue.remainingOperationIds())
    assertEquals("server-item-1", applied.single().serverId)
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
}
```

- [ ] **Step 2: 运行测试确认失败**

Run: `gradle :app:testDebugUnitTest --tests "com.homeinventory.app.data.sync.SyncEngineTest" --no-daemon`
Expected: FAIL（`onOperationApplied` 参数不存在等）

- [ ] **Step 3: 扩展 SyncEngine**

`SyncEngine.kt` 修改为：

```kotlin
data class RemoteSyncApplied(
    val clientOperationId: String,
    val entity: String,
    val localId: String?,
    val serverId: String,
    val serverUpdatedAt: String?,
)

class SyncEngine(
    private val queue: PendingOperationQueue,
    private val remote: RemoteSyncClient,
    private val onOperationApplied: (RemoteSyncApplied) -> Unit = {},
) {
    suspend fun syncWhenOnline(connectivityObserver: ConnectivityObserver) {
        connectivityObserver.isOnline
            .distinctUntilChanged()
            .filter { isOnline -> isOnline }
            .collect { syncPendingOperations() }
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
```

`RemoteSyncClient` 返回 `RemoteSyncResult(applied: List<RemoteSyncApplied>, conflicts: List<RemoteSyncConflict>)`；`RetrofitRemoteSyncClient` 在解析响应时构造 `RemoteSyncApplied`（从 `MobileSyncResultDto` 的 status=applied 分支取 serverId/serverUpdatedAt/localId）。

`PendingOperationQueue` 增加 `markConflict` 已存在；`FakePendingQueue` 增加 `operationStates()`。

- [ ] **Step 4: InventoryRepository 接入 sync 与离线 update/delete**

离线更新/删除方法（追加）：

```kotlin
suspend fun updateItemOffline(
    localId: String,
    serverId: String?,
    baseServerUpdatedAt: String?,
    name: String,
    note: String,
    expireDate: String?,
    locationId: String?,
) {
    itemDao.upsert(
        ItemEntity(
            id = localId,
            serverId = serverId,
            locationId = locationId,
            name = name,
            note = note,
            expireDate = expireDate,
            serverUpdatedAt = baseServerUpdatedAt,
            localUpdatedAt = System.currentTimeMillis(),
            syncStatus = SyncStatus.PendingUpdate,
        ),
    )
    pendingOperationDao.upsertOperation(
        PendingOperationEntity(
            clientOperationId = "op-${UUID.randomUUID()}",
            entity = "item",
            action = "update",
            localId = localId,
            serverId = serverId,
            baseServerUpdatedAt = baseServerUpdatedAt,
            payloadJson = gson.toJson(mapOf("name" to name, "note" to note, "expireDate" to expireDate, "locationId" to locationId)),
            state = "pending",
            createdAt = System.currentTimeMillis(),
            errorMessage = null,
        ),
    )
}

suspend fun deleteItemOffline(
    localId: String,
    serverId: String?,
    baseServerUpdatedAt: String?,
) {
    itemDao.upsert(
        itemDao.observeAll().first().first { it.id == localId }.copy(
            syncStatus = SyncStatus.PendingDelete,
        ),
    )
    pendingOperationDao.upsertOperation(
        PendingOperationEntity(
            clientOperationId = "op-${UUID.randomUUID()}",
            entity = "item",
            action = "delete",
            localId = localId,
            serverId = serverId,
            baseServerUpdatedAt = baseServerUpdatedAt,
            payloadJson = "{}",
            state = "pending",
            createdAt = System.currentTimeMillis(),
            errorMessage = null,
        ),
    )
}
```

`syncPendingOperations()`：

```kotlin
suspend fun syncPendingOperations(): Result<Unit> {
    val engine = SyncEngine(
        queue = DaoPendingOperationQueue(pendingOperationDao),
        remote = RetrofitRemoteSyncClient(api),
        onOperationApplied = { applied ->
            when (applied.entity) {
                "area" -> areaDao.markSynced(applied.localId.orEmpty(), applied.serverId, applied.serverUpdatedAt.orEmpty())
                "location" -> locationDao.markSynced(applied.localId.orEmpty(), applied.serverId, applied.serverUpdatedAt.orEmpty())
                "item" -> itemDao.markSynced(applied.localId.orEmpty(), applied.serverId, applied.serverUpdatedAt.orEmpty())
            }
        },
    )
    engine.syncPendingOperations()
    refreshSnapshot()
    return Result.success(Unit)
}
```

注意 `markSynced` 的 `serverId`/`serverUpdatedAt` 参数改为非空约束时可传 `applied.serverId`；Room 查询字段为 String 非空。若 `serverUpdatedAt` 可空则查询签名用 `String?` 并在 SQL 中 `= :serverUpdatedAt`（Room 对 null 匹配 `is null`，需在 SQL 使用 `is :serverUpdatedAt` 或改为 `String`）。实施时统一用非空 `serverUpdatedAt`（服务端 applied 总返回）。

- [ ] **Step 5: 运行测试确认通过**

Run: `gradle :app:testDebugUnitTest --tests "com.homeinventory.app.data.sync.SyncEngineTest" --no-daemon`
Expected: PASS

- [ ] **Step 6: 提交**

```bash
git add android/app/src/main/java/com/homeinventory/app/data/sync/SyncEngine.kt android/app/src/main/java/com/homeinventory/app/data/repository/InventoryRepository.kt android/app/src/test/java/com/homeinventory/app/data/sync/SyncEngineTest.kt
git commit -m "feat: offline update delete and conflict-aware sync"
```

### Task 9: 网络恢复监听

**Files:**
- Create: `android/app/src/main/java/com/homeinventory/app/data/sync/AndroidConnectivityObserver.kt`
- Modify: `android/app/src/main/java/com/homeinventory/app/ui/AppRoot.kt`（启动 `syncWhenOnline`）

- [ ] **Step 1: 实现**

```kotlin
package com.homeinventory.app.data.sync

import android.content.Context
import android.net.ConnectivityManager
import android.net.Network
import android.net.NetworkCapabilities
import kotlinx.coroutines.channels.awaitClose
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.callbackFlow

class AndroidConnectivityObserver(context: Context) : ConnectivityObserver {
    private val connectivityManager =
        context.getSystemService(Context.CONNECTIVITY_SERVICE) as ConnectivityManager

    override val isOnline: Flow<Boolean> = callbackFlow {
        val callback = object : ConnectivityManager.NetworkCallback() {
            override fun onAvailable(network: Network) {
                trySend(true)
            }

            override fun onLost(network: Network) {
                trySend(false)
            }
        }
        connectivityManager.registerDefaultNetworkCallback(callback)
        trySend(currentlyOnline())
        awaitClose { connectivityManager.unregisterNetworkCallback(callback) }
    }

    private fun currentlyOnline(): Boolean {
        val network = connectivityManager.activeNetwork ?: return false
        val capabilities = connectivityManager.getNetworkCapabilities(network) ?: return false
        return capabilities.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET)
    }
}
```

- [ ] **Step 2: AppRoot 接线（在登录成功分支里启动同步监听）**

```kotlin
val connectivityObserver = remember { AndroidConnectivityObserver(context) }
LaunchedEffect(isLoggedIn) {
    if (isLoggedIn) {
        launch { syncEngine.syncWhenOnline(connectivityObserver) }
    }
}
```

其中 `syncEngine = SyncEngine(DaoPendingOperationQueue(db.pendingOperationDao()), RetrofitRemoteSyncClient(api), onOperationApplied = ...)`，与 Repository 的 `syncPendingOperations` 共用同一套回调（抽成 `repository::syncPendingOperations` 的包装即可：`SyncEngine` 回调内调用 `repository.applySyncResult(...)`）。

- [ ] **Step 3: 构建验证并提交**

Run: `gradle :app:assembleDebug --no-daemon`
Expected: BUILD SUCCESSFUL

```bash
git add android/app/src/main/java/com/homeinventory/app/data/sync/AndroidConnectivityObserver.kt android/app/src/main/java/com/homeinventory/app/ui/AppRoot.kt
git commit -m "feat: auto sync on network recovery"
```

### Task 10: 退出登录清理 + 服务端回归

**Files:**
- Modify: `android/app/src/main/java/com/homeinventory/app/ui/AppRoot.kt`（退出：logout → clear session → clear Room）
- Run: 服务端契约测试

- [ ] **Step 1: 退出逻辑**

```kotlin
fun signOut() {
    scope.launch {
        authRepository.logout()
        database.clearAll()
        isLoggedIn = false
    }
}
```

`AppDatabase` 增加：

```kotlin
suspend fun clearAll() {
    areaDao().clearAll()
    locationDao().clearAll()
    itemDao().clearAll()
    pendingOperationDao().clearAll()
    syncStateDao().put(SyncStateEntity("last_sync", ""))
}
```

（`clearAll` 需要在事务中执行：用 `@Transaction` 或 `withTransaction`。Room 中跨 DAO 事务：给 AppDatabase 加 `@Transaction suspend fun clearAll()`。）

- [ ] **Step 2: 服务端契约回归**

Run（仓库根）:
```bash
npm test -- src/features/inventory/mobile-sync.test.ts src/features/inventory/inventory-service.test.ts src/app/api/mobile/inventory/sync/route.test.ts src/app/api/mobile/inventory/permissions.test.ts
```
Expected: 4 files / 46 tests PASS

- [ ] **Step 3: 提交**

```bash
git add android/app/src/main/java/com/homeinventory/app/data/local/AppDatabase.kt android/app/src/main/java/com/homeinventory/app/ui/AppRoot.kt
git commit -m "feat: sign out clears session and local data"
```

---

## 阶段 3：UI 对齐层

### Task 11: 主题与表单校验

**Files:**
- Create: `android/app/src/main/java/com/homeinventory/app/ui/theme/Color.kt`
- Create: `android/app/src/main/java/com/homeinventory/app/ui/theme/Theme.kt`
- Create: `android/app/src/main/java/com/homeinventory/app/ui/dashboard/InventoryFormValidation.kt`
- Test: `android/app/src/test/java/com/homeinventory/app/ui/dashboard/InventoryFormValidationTest.kt`

- [ ] **Step 1: 主题色（与 `src/app/globals.css` 的 `--primary`、`--background`、`--surface`、`--border`、`--muted-foreground`、`--danger` 对齐）**

`Color.kt`：

```kotlin
package com.homeinventory.app.ui.theme

import androidx.compose.ui.graphics.Color

val Primary = Color(0xFF256F6B)
val Background = Color(0xFFF7F7F5)
val Surface = Color(0xFFFFFFFF)
val SurfaceElevated = Color(0xFFFFFFFF)
val SurfaceMuted = Color(0xFFF0F2EF)
val Border = Color(0xFFE2E4DF)
val MutedForeground = Color(0xFF6B7280)
val Danger = Color(0xFFDC2626)
val Foreground = Color(0xFF111827)
```

（实施时以 `src/app/globals.css` 实际值校准。）

`Theme.kt`：

```kotlin
package com.homeinventory.app.ui.theme

import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable

private val AppColorScheme = lightColorScheme(
    primary = Primary,
    background = Background,
    surface = Surface,
    surfaceVariant = SurfaceMuted,
    outline = Border,
    onSurface = Foreground,
    onPrimary = Surface,
    error = Danger,
)

@Composable
fun HomeInventoryTheme(content: @Composable () -> Unit) {
    MaterialTheme(
        colorScheme = AppColorScheme,
        content = content,
    )
}
```

- [ ] **Step 2: 写表单校验失败测试**

```kotlin
package com.homeinventory.app.ui.dashboard

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class InventoryFormValidationTest {
    @Test
    fun itemNameIsRequiredAndMax120() {
        assertFalse(validateItemForm(name = "  ").isValid)
        assertFalse(validateItemForm(name = "x".repeat(121)).isValid)
        assertTrue(validateItemForm(name = "感冒药").isValid)
    }

    @Test
    fun noteMax1000() {
        assertFalse(validateItemForm(name = "药", note = "x".repeat(1001)).isValid)
    }

    @Test
    fun locationNameRequiredAndMax80() {
        assertFalse(validateLocationForm("  ").isValid)
        assertFalse(validateLocationForm("x".repeat(81)).isValid)
        assertTrue(validateLocationForm("上层抽屉").isValid)
    }

    @Test
    fun areaNameRequiredAndMax80() {
        assertFalse(validateAreaForm("  ").isValid)
        assertFalse(validateAreaForm("x".repeat(81)).isValid)
        assertTrue(validateAreaForm("厨房").isValid)
    }
}
```

- [ ] **Step 3: 运行测试确认失败**

Run: `gradle :app:testDebugUnitTest --tests "com.homeinventory.app.ui.dashboard.InventoryFormValidationTest" --no-daemon`
Expected: FAIL

- [ ] **Step 4: 实现校验**

```kotlin
package com.homeinventory.app.ui.dashboard

data class FormValidation(val isValid: Boolean, val message: String? = null)

fun validateItemForm(name: String, note: String = ""): FormValidation {
    if (name.trim().isEmpty()) return FormValidation(false, "物品名称不能为空")
    if (name.length > 120) return FormValidation(false, "物品名称不能超过 120 个字符")
    if (note.length > 1000) return FormValidation(false, "备注不能超过 1000 个字符")
    return FormValidation(true)
}

fun validateLocationForm(name: String): FormValidation {
    if (name.trim().isEmpty()) return FormValidation(false, "位置名称不能为空")
    if (name.length > 80) return FormValidation(false, "位置名称不能超过 80 个字符")
    return FormValidation(true)
}

fun validateAreaForm(name: String): FormValidation {
    if (name.trim().isEmpty()) return FormValidation(false, "区域名称不能为空")
    if (name.length > 80) return FormValidation(false, "区域名称不能超过 80 个字符")
    return FormValidation(true)
}
```

- [ ] **Step 5: 运行测试确认通过并提交**

Run: 同 Step 3 命令，Expected: PASS

```bash
git add android/app/src/main/java/com/homeinventory/app/ui/theme/ android/app/src/main/java/com/homeinventory/app/ui/dashboard/InventoryFormValidation.kt android/app/src/test/java/com/homeinventory/app/ui/dashboard/InventoryFormValidationTest.kt
git commit -m "feat: dashboard theme and form validation"
```

### Task 12: DashboardViewModel（观察 + 筛选 + 排序 + 过期状态）

**Files:**
- Create: `android/app/src/main/java/com/homeinventory/app/ui/dashboard/DashboardViewModel.kt`
- Test: `android/app/src/test/java/com/homeinventory/app/ui/dashboard/DashboardViewModelTest.kt`

- [ ] **Step 1: 写失败测试**

```kotlin
package com.homeinventory.app.ui.dashboard

import com.homeinventory.app.data.repository.InventorySnapshot
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertEquals
import org.junit.Test

class DashboardViewModelTest {
    @Test
    fun filtersItemsByArea() = runTest {
        val snapshot = InventorySnapshot(
            items = listOf(
                item("item-1", "牛奶", areaId = "area-1", locationId = "location-1"),
                item("item-2", "纸巾", areaId = "area-2", locationId = "location-2"),
            ),
        )
        val viewModel = DashboardViewModel(
            inventory = MutableStateFlow(snapshot),
            syncPending = { Result.success(Unit) },
        )

        viewModel.selectArea("area-1")

        assertEquals(listOf("牛奶"), viewModel.state.value.visibleItems.map { it.name })
    }

    @Test
    fun sortsItemsByExpireSoonFirst() = runTest {
        val snapshot = InventorySnapshot(
            items = listOf(
                item("item-1", "牛奶", expireDate = "2026-08-20"),
                item("item-2", "药品", expireDate = "2026-08-10"),
            ),
        )
        val viewModel = DashboardViewModel(
            inventory = MutableStateFlow(snapshot),
            syncPending = { Result.success(Unit) },
        )

        viewModel.sortByExpireSoon()

        assertEquals(listOf("药品", "牛奶"), viewModel.state.value.visibleItems.map { it.name })
    }

    @Test
    fun marksExpiredAndSoonItems() = runTest {
        val today = LocalDate.parse("2026-08-05")
        val snapshot = InventorySnapshot(
            items = listOf(
                item("item-1", "过期药", expireDate = "2026-08-01"),
                item("item-2", "将过期奶", expireDate = "2026-08-20"),
                item("item-3", "正常品", expireDate = "2026-12-01"),
            ),
        )
        val viewModel = DashboardViewModel(
            inventory = MutableStateFlow(snapshot),
            syncPending = { Result.success(Unit) },
            today = today,
        )

        val statuses = viewModel.state.value.visibleItems.associate { it.name to it.expirationStatus }
        assertEquals("expired", statuses["过期药"])
        assertEquals("soon", statuses["将过期奶"])
        assertEquals("normal", statuses["正常品"])
    }

    private fun item(
        id: String,
        name: String,
        expireDate: String? = null,
        areaId: String? = null,
        locationId: String? = null,
    ) = InventorySnapshot.ItemView(
        id = id,
        name = name,
        note = "",
        expireDate = expireDate,
        locationId = locationId,
        areaId = areaId,
        locationName = null,
        syncStatus = "synced",
    )
}
```

（过期规则：`expired` = 过期日 < 今天；`soon` = 过期日 >= 今天且 <= 今天+30 天；否则 `normal`。与 Web `getExpirationStatus` 一致。）

- [ ] **Step 2: 运行测试确认失败**

Run: `gradle :app:testDebugUnitTest --tests "com.homeinventory.app.ui.dashboard.DashboardViewModelTest" --no-daemon`
Expected: FAIL

- [ ] **Step 3: 实现 ViewModel**

```kotlin
package com.homeinventory.app.ui.dashboard

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.homeinventory.app.data.repository.InventorySnapshot
import java.time.LocalDate
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch

data class DashboardUiItem(
    val id: String,
    val name: String,
    val note: String,
    val expireDate: String?,
    val areaId: String?,
    val locationName: String?,
    val syncStatus: String,
    val expirationStatus: String,
)

data class DashboardFilters(
    val search: String = "",
    val areaId: String? = null,
    val locationId: String? = null,
)

enum class ItemSortMode { ExpireSoon, ExpireLate, Name }

data class DashboardUiState(
    val areas: List<InventorySnapshot.AreaView> = emptyList(),
    val locations: List<InventorySnapshot.LocationView> = emptyList(),
    val items: List<DashboardUiItem> = emptyList(),
    val visibleItems: List<DashboardUiItem> = emptyList(),
    val filters: DashboardFilters = DashboardFilters(),
    val sortMode: ItemSortMode = ItemSortMode.ExpireSoon,
    val isRefreshing: Boolean = false,
    val errorMessage: String? = null,
    val syncMessage: String? = null,
)

class DashboardViewModel(
    inventory: kotlinx.coroutines.flow.Flow<InventorySnapshot>,
    private val syncPending: suspend () -> Result<Unit> = { Result.success(Unit) },
    private val today: LocalDate = LocalDate.now(),
) : ViewModel() {
    private val filters = MutableStateFlow(DashboardFilters())
    private val sortMode = MutableStateFlow(ItemSortMode.ExpireSoon)
    private val refreshFlag = MutableStateFlow(0)

    val state: StateFlow<DashboardUiState> =
        combine(inventory, filters, sortMode, refreshFlag) { snapshot, filter, sort, _ ->
            val locationNames = snapshot.locations.associate { it.id to it.name }
            val items = snapshot.items.map { item ->
                DashboardUiItem(
                    id = item.id,
                    name = item.name,
                    note = item.note,
                    expireDate = item.expireDate,
                    areaId = item.areaId,
                    locationName = item.locationName ?: item.locationId?.let(locationNames::get),
                    syncStatus = item.syncStatus,
                    expirationStatus = expirationStatus(item.expireDate),
                )
            }
            val visible = filterItems(items, filter, snapshot).sortedWith(itemComparator(sort))
            DashboardUiState(
                areas = snapshot.areas,
                locations = snapshot.locations,
                items = items,
                visibleItems = visible,
                filters = filter,
                sortMode = sort,
            )
        }.stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), DashboardUiState())

    fun updateSearch(value: String) {
        filters.value = filters.value.copy(search = value)
    }

    fun selectArea(areaId: String?) {
        filters.value = filters.value.copy(areaId = areaId, locationId = null)
    }

    fun selectLocation(locationId: String?) {
        filters.value = filters.value.copy(locationId = locationId)
    }

    fun sortByExpireSoon() { sortMode.value = ItemSortMode.ExpireSoon }
    fun sortByExpireLate() { sortMode.value = ItemSortMode.ExpireLate }
    fun sortByName() { sortMode.value = ItemSortMode.Name }

    fun refresh() {
        viewModelScope.launch {
            syncPending()
            refreshFlag.value += 1
        }
    }

    private fun filterItems(
        items: List<DashboardUiItem>,
        filter: DashboardFilters,
        snapshot: InventorySnapshot,
    ): List<DashboardUiItem> {
        val areaOfItem = snapshot.items.associate { it.id to it.areaId }
        val locationOfItem = snapshot.items.associate { it.id to it.locationId }
        return items.filter { item ->
            val matchesSearch = filter.search.isBlank() ||
                item.name.contains(filter.search, ignoreCase = true) ||
                item.note.contains(filter.search, ignoreCase = true) ||
                item.locationName?.contains(filter.search, ignoreCase = true) == true
            val matchesArea = filter.areaId == null || areaOfItem[item.id] == filter.areaId
            val matchesLocation = filter.locationId == null || locationOfItem[item.id] == filter.locationId
            matchesSearch && matchesArea && matchesLocation
        }
    }

    private fun itemComparator(sort: ItemSortMode): Comparator<DashboardUiItem> = when (sort) {
        ItemSortMode.ExpireSoon -> compareBy(
            { it.expirationStatus != "expired" },
            { it.expireDate ?: "9999-12-31" },
            { it.name },
        )
        ItemSortMode.ExpireLate -> compareByDescending<DashboardUiItem> { it.expireDate ?: "" }.thenBy { it.name }
        ItemSortMode.Name -> compareBy { it.name }
    }

    private fun expirationStatus(expireDate: String?): String {
        if (expireDate.isNullOrBlank()) return "normal"
        return try {
            val date = LocalDate.parse(expireDate)
            when {
                date.isBefore(today) -> "expired"
                !date.isAfter(today.plusDays(30)) -> "soon"
                else -> "normal"
            }
        } catch (_: Exception) {
            "normal"
        }
    }
}
```

（`DashboardUiItem` 的 `areaId` 由 UI 层通过 `state.areas/locations` 映射；若需要直接在 item 上带 areaId，把 `DashboardUiItem` 增加 `areaId: String?` 并在构造时从 snapshot 填上，测试保持一致。）

- [ ] **Step 4: 运行测试确认通过并提交**

Run: 同 Step 2 命令，Expected: PASS

```bash
git add android/app/src/main/java/com/homeinventory/app/ui/dashboard/DashboardViewModel.kt android/app/src/test/java/com/homeinventory/app/ui/dashboard/DashboardViewModelTest.kt
git commit -m "feat: dashboard view model with filter sort expiration"
```

### Task 13: 主界面组件（TopBar / AreaStrip / LocationStrip / ItemList / FAB）

**Files:**
- Create: `android/app/src/main/java/com/homeinventory/app/ui/dashboard/DashboardScreen.kt`
- Create: `android/app/src/main/java/com/homeinventory/app/ui/dashboard/components/TopBar.kt`
- Create: `android/app/src/main/java/com/homeinventory/app/ui/dashboard/components/AreaStrip.kt`
- Create: `android/app/src/main/java/com/homeinventory/app/ui/dashboard/components/LocationStrip.kt`
- Create: `android/app/src/main/java/com/homeinventory/app/ui/dashboard/components/ItemList.kt`
- Create: `android/app/src/main/java/com/homeinventory/app/ui/dashboard/components/FloatingAddButton.kt`
- Delete: `android/app/src/main/java/com/homeinventory/app/ui/inventory/InventoryScreen.kt`
- Delete: `android/app/src/main/java/com/homeinventory/app/ui/inventory/InventoryViewModel.kt`

- [ ] **Step 1: 主界面骨架（Compose 无 JVM 测试，用编译 + 后续真机验收）**

`DashboardScreen.kt` 结构：

```kotlin
@Composable
fun DashboardScreen(
    state: DashboardUiState,
    onSearchChange: (String) -> Unit,
    onSelectArea: (String?) -> Unit,
    onSelectLocation: (String?) -> Unit,
    onSortChange: (ItemSortMode) -> Unit,
    onAddItem: () -> Unit,
    onAddLocation: () -> Unit,
    onAddArea: () -> Unit,
    onEditItem: (DashboardUiItem) -> Unit,
    onRefresh: () -> Unit,
    onBackup: () -> Unit,
    onImport: () -> Unit,
    onSignOut: () -> Unit,
    modifier: Modifier = Modifier,
) {
    Scaffold(
        topBar = { TopBar(onBackup = onBackup, onImport = onImport, onSignOut = onSignOut) },
        floatingActionButton = { FloatingAddButton(onClick = onAddItem) },
    ) { padding ->
        Column(modifier = Modifier.padding(padding).fillMaxSize()) {
            SearchField(value = state.filters.search, onChange = onSearchChange)
            AreaStrip(
                areas = state.areas,
                selectedAreaId = state.filters.areaId,
                itemCountByArea = state.items.groupBy { it.areaId }.mapValues { it.value.size },
                onSelectArea = onSelectArea,
                onAddArea = onAddArea,
            )
            LocationStrip(
                locations = state.locations,
                selectedLocationId = state.filters.locationId,
                selectedAreaId = state.filters.areaId,
                onSelectLocation = onSelectLocation,
                onClearArea = { onSelectArea(null) },
                onAddLocation = onAddLocation,
            )
            ItemList(
                items = state.visibleItems,
                sortMode = state.sortMode,
                onSortChange = onSortChange,
                onEditItem = onEditItem,
                isEmpty = state.items.isEmpty(),
            )
        }
    }
}
```

组件要点（视觉对齐 Web）：
- `TopBar`：左侧「家」字徽标（primary 底色圆角块）+「家中清单」，右侧「备份」「导入」「退出」文字按钮。
- `AreaStrip`：LazyRow；每项 = 色点 + 名称 + 数量；选中态 primary 边框 + 浅绿底；末尾「+ 新增区域」。
- `LocationStrip`：同构；选中区域时右侧显示「全部区域」。
- `ItemList`：LazyColumn；排序用 `DropdownMenu`（按过期日 ↑ / 按过期日 ↓ / 按名称）；行 = 首字方块 + 名称 + 位置/备注 + 过期日期/状态；空状态文案按 Web。
- `FloatingAddButton`：右下圆角大按钮「+ 新增」。

- [ ] **Step 2: 构建验证**

Run: `gradle :app:compileDebugKotlin --no-daemon`
Expected: BUILD SUCCESSFUL（旧 `AppRoot` 引用 InventoryScreen 会报错，同步在 Task 15 里改；若本任务先编译不过，先保留旧文件到 Task 15 一并删除）

- [ ] **Step 3: 提交**

```bash
git add android/app/src/main/java/com/homeinventory/app/ui/dashboard/
git commit -m "feat: dashboard screen and components"
```

### Task 14: 表单弹窗（新增/编辑区域、位置、物品 + 搜索）

**Files:**
- Create: `android/app/src/main/java/com/homeinventory/app/ui/dashboard/dialogs/SearchDialog.kt`
- Create: `android/app/src/main/java/com/homeinventory/app/ui/dashboard/dialogs/ItemFormDialog.kt`
- Create: `android/app/src/main/java/com/homeinventory/app/ui/dashboard/dialogs/LocationFormDialog.kt`
- Create: `android/app/src/main/java/com/homeinventory/app/ui/dashboard/dialogs/AreaFormDialog.kt`

- [ ] **Step 1: 弹窗实现（要点）**

- `SearchDialog`：`AlertDialog`（或底部弹层）含搜索框、区域下拉、位置下拉、结果 LazyColumn；关闭按钮；空结果文案「没有匹配的物品。」。
- `ItemFormDialog`：字段顺序 = 物品名称 → 区域（含「不设置位置」「未分区」）→ 位置（联动，未选区域禁用）→ 备注 → 过期日（`DatePickerDialog`）；错误文案；按钮「保存物品 / 保存修改」。
- `LocationFormDialog`：位置名称 + 所属区域（可未分区）。
- `AreaFormDialog`：区域名称 + 颜色圆点选择（与 Web `areaColors` 数组一致，取 `defaultAreaColors`：从 `src/features/inventory/inventory-actions.ts` 读取色值）。

弹窗统一签名风格：

```kotlin
@Composable
fun ItemFormDialog(
    areas: List<InventorySnapshot.AreaView>,
    locations: List<InventorySnapshot.LocationView>,
    initial: ItemFormValues?,
    isSaving: Boolean,
    errorMessage: String?,
    onSave: (ItemFormValues) -> Unit,
    onDismiss: () -> Unit,
)
```

- [ ] **Step 2: 构建验证并提交**

Run: `gradle :app:compileDebugKotlin --no-daemon`，Expected: BUILD SUCCESSFUL

```bash
git add android/app/src/main/java/com/homeinventory/app/ui/dashboard/dialogs/
git commit -m "feat: dashboard form dialogs and search"
```

### Task 15: AppRoot 接线（自动登录 + 主界面 + 弹窗状态）

**Files:**
- Modify: `android/app/src/main/java/com/homeinventory/app/ui/AppRoot.kt`
- Delete: `android/app/src/main/java/com/homeinventory/app/ui/inventory/`（旧文件）

- [ ] **Step 1: AppRoot 重构**

```kotlin
@Composable
fun AppRoot() {
    val app = LocalContext.current.applicationContext as HomeInventoryApplication
    val sessionStore = app.sessionStore
    val api = remember { NetworkModule.createApi(sessionStore) }
    val repository = remember {
        InventoryRepository(
            api = api,
            areaDao = app.database.areaDao(),
            locationDao = app.database.locationDao(),
            itemDao = app.database.itemDao(),
            pendingOperationDao = app.database.pendingOperationDao(),
            syncStateDao = app.database.syncStateDao(),
        )
    }
    val authRepository = remember { AuthRepository(api, sessionStore) }
    val factory = remember(repository) {
        viewModelFactory {
            initializer {
                DashboardViewModel(
                    inventory = repository.observeInventory(),
                    syncPending = repository::syncPendingOperations,
                )
            }
        }
    }
    val viewModel: DashboardViewModel = viewModel(factory = factory)
    var isLoggedIn by remember { mutableStateOf(sessionStore.sessionCookie() != null) }
    val scope = rememberCoroutineScope()

    LaunchedEffect(isLoggedIn) {
        if (isLoggedIn) {
            scope.launch { repository.refreshSnapshot() }
            scope.launch {
                SyncEngine(
                    queue = DaoPendingOperationQueue(app.database.pendingOperationDao()),
                    remote = RetrofitRemoteSyncClient(api),
                    onOperationApplied = { applied ->
                        when (applied.entity) {
                            "area" -> scope.launch { app.database.areaDao().markSynced(applied.localId.orEmpty(), applied.serverId, applied.serverUpdatedAt.orEmpty()) }
                            "location" -> scope.launch { app.database.locationDao().markSynced(applied.localId.orEmpty(), applied.serverId, applied.serverUpdatedAt.orEmpty()) }
                            "item" -> scope.launch { app.database.itemDao().markSynced(applied.localId.orEmpty(), applied.serverId, applied.serverUpdatedAt.orEmpty()) }
                        }
                    },
                ).syncWhenOnline(AndroidConnectivityObserver(app))
            }
        }
    }

    HomeInventoryTheme {
        if (isLoggedIn) {
            DashboardHost(
                viewModel = viewModel,
                repository = repository,
                onSignOut = {
                    scope.launch {
                        authRepository.logout()
                        app.database.clearAll()
                        isLoggedIn = false
                    }
                },
            )
        } else {
            LoginScreen(
                email = email,
                password = password,
                serverUrl = AppConfig.baseUrl,
                isLoading = isLoading,
                errorMessage = errorMessage,
                onEmailChange = { email = it; errorMessage = null },
                onPasswordChange = { password = it; errorMessage = null },
                onLogin = {
                    isLoading = true
                    scope.launch {
                        authRepository.login(email, password)
                            .onSuccess {
                                password = ""
                                isLoggedIn = true
                                scope.launch { repository.refreshSnapshot() }
                            }
                            .onFailure { error -> errorMessage = error.message ?: "登录失败" }
                        isLoading = false
                    }
                },
            )
        }
    }
}
```

`DashboardHost` 是本地 Composable：持有各弹窗开关状态（`showSearch/showItemForm/...`），把 viewModel 状态映射到 `DashboardScreen` 的各个回调，并调用 repository 的在线/离线 CRUD（有网走 online、无网走 offline——网络判定用 `AndroidConnectivityObserver` 最新值或简化为「online 失败回退 offline」：先尝试 online，网络异常时自动转为 offline 入队，这样实现简单且可靠）。

操作回调模式（以新增物品为例）：

```kotlin
onSaveItem = { values ->
    scope.launch {
        repository.createItemOnline(values.name, values.note, values.expireDate, values.locationId)
            .onFailure { error ->
                if (isNetworkError(error)) {
                    repository.createItemOffline(values.name, values.note, values.expireDate, values.locationId)
                } else {
                    formError = error.message
                }
            }
    }
}
```

`isNetworkError` = 错误消息以「无法连接服务器」开头。离线写入后由 SyncEngine 网络恢复时自动提交。

- [ ] **Step 2: 构建验证**

Run: `gradle :app:assembleDebug --no-daemon`
Expected: BUILD SUCCESSFUL

- [ ] **Step 3: 提交**

```bash
git add android/app/src/main/java/com/homeinventory/app/ui/AppRoot.kt android/app/src/main/java/com/homeinventory/app/ui/dashboard/ android/app/src/main/java/com/homeinventory/app/ui/inventory/ android/app/src/main/java/com/homeinventory/app/ui/login/
git commit -m "feat: wire dashboard with auto login and offline fallback"
```

---

## 阶段 4：Excel 导入导出

### Task 16: 依赖与导出生成器

**Files:**
- Modify: `android/app/build.gradle.kts`（POI + desugar）
- Create: `android/app/src/main/java/com/homeinventory/app/data/excel/BackupModels.kt`
- Create: `android/app/src/main/java/com/homeinventory/app/data/excel/ExcelBackupGenerator.kt`
- Test: `android/app/src/test/java/com/homeinventory/app/data/excel/ExcelBackupGeneratorTest.kt`

- [ ] **Step 1: 加依赖与 desugaring**

`android/app/build.gradle.kts`：

```kotlin
android {
    compileOptions {
        isCoreLibraryDesugaringEnabled = true
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
}

dependencies {
    coreLibraryDesugaring("com.android.tools:desugar_jdk_libs:2.0.4")
    implementation("org.apache.poi:poi-ooxml:5.2.5")
    implementation("org.apache.poi:poi-ooxml-lite:5.2.5")
    implementation("org.apache.xmlbeans:xmlbeans:5.2.0")
}
```

- [ ] **Step 2: 写失败测试（生成 xlsx 后可被重新读回）**

```kotlin
package com.homeinventory.app.data.excel

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class ExcelBackupGeneratorTest {
    @Test
    fun generatesWorkbookWithExpectedHeaderAndRows() {
        val rows = listOf(
            BackupRow(index = 1, name = "牛奶", locationName = "冰箱", areaName = "厨房", note = "记得喝", expireDate = "2026-08-10"),
        )

        val bytes = ExcelBackupGenerator.generate(rows)
        val workbook = org.apache.poi.xssf.usermodel.XSSFWorkbook(
            java.io.ByteArrayInputStream(bytes),
        )
        val sheet = workbook.getSheet("物品清单")
        assertEquals("序号", sheet.getRow(0).getCell(0).stringCellValue)
        assertEquals("名称", sheet.getRow(0).getCell(1).stringCellValue)
        assertEquals("牛奶", sheet.getRow(1).getCell(1).stringCellValue)
        assertEquals("冰箱", sheet.getRow(1).getCell(2).stringCellValue)
        assertEquals("厨房", sheet.getRow(1).getCell(3).stringCellValue)
        workbook.close()
    }

    @Test
    fun filenameMatchesWebFormat() {
        val name = ExcelBackupGenerator.filename(java.time.LocalDateTime.of(2026, 8, 5, 9, 30, 15))
        assertEquals("物品清单_2026-08-05_09-30-15.xlsx", name)
    }
}
```

- [ ] **Step 3: 运行测试确认失败**

Run: `gradle :app:testDebugUnitTest --tests "com.homeinventory.app.data.excel.ExcelBackupGeneratorTest" --no-daemon`
Expected: FAIL（类不存在；同时首次会下载 POI 依赖，耗时较长属正常）

- [ ] **Step 4: 实现**

`BackupModels.kt`：

```kotlin
package com.homeinventory.app.data.excel

data class BackupRow(
    val index: Int,
    val name: String,
    val locationName: String,
    val areaName: String,
    val note: String,
    val expireDate: String?,
)
```

`ExcelBackupGenerator.kt`：

```kotlin
package com.homeinventory.app.data.excel

import java.io.ByteArrayOutputStream
import java.time.LocalDateTime
import java.time.format.DateTimeFormatter
import org.apache.poi.ss.usermodel.Row
import org.apache.poi.ss.usermodel.Sheet
import org.apache.poi.xssf.usermodel.XSSFWorkbook

object ExcelBackupGenerator {
    private val HEADERS = listOf("序号", "名称", "格子编号", "所在区域", "备注", "有效期")
    private const val SHEET_NAME = "物品清单"
    private val TIMESTAMP = DateTimeFormatter.ofPattern("yyyy-MM-dd_HH-mm-ss")

    fun generate(rows: List<BackupRow>): ByteArray {
        val workbook = XSSFWorkbook()
        val sheet = workbook.createSheet(SHEET_NAME)
        val header = sheet.createRow(0)
        HEADERS.forEachIndexed { index, text -> header.createCell(index).setCellValue(text) }
        rows.forEachIndexed { rowIndex, row ->
            val excelRow = sheet.createRow(rowIndex + 1)
            excelRow.createCell(0).setCellValue(row.index.toDouble())
            excelRow.createCell(1).setCellValue(row.name)
            excelRow.createCell(2).setCellValue(row.locationName)
            excelRow.createCell(3).setCellValue(row.areaName)
            excelRow.createCell(4).setCellValue(row.note)
            excelRow.createCell(5).setCellValue(row.expireDate ?: "")
        }
        return ByteArrayOutputStream().use { output ->
            workbook.write(output)
            workbook.close()
            output.toByteArray()
        }
    }

    fun filename(now: LocalDateTime = LocalDateTime.now()): String =
        "物品清单_${now.format(TIMESTAMP)}.xlsx"
}
```

- [ ] **Step 5: 运行测试确认通过并提交**

Run: 同 Step 3 命令，Expected: PASS

```bash
git add android/app/build.gradle.kts android/app/src/main/java/com/homeinventory/app/data/excel/ android/app/src/test/java/com/homeinventory/app/data/excel/ExcelBackupGeneratorTest.kt
git commit -m "feat: excel backup generator"
```

### Task 17: 导入（文件选择 → 预检 → 冲突弹窗 → 提交 → 汇总）

**Files:**
- Create: `android/app/src/main/java/com/homeinventory/app/data/repository/ImportExportRepository.kt`
- Create: `android/app/src/main/java/com/homeinventory/app/ui/dashboard/dialogs/ImportPreviewDialog.kt`
- Test: `android/app/src/test/java/com/homeinventory/app/data/repository/ImportExportRepositoryTest.kt`

- [ ] **Step 1: 写失败测试（preview/commit 契约解析）**

```kotlin
package com.homeinventory.app.data.repository

import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class ImportExportRepositoryTest {
    @Test
    fun previewParsesConflictAndCreateCounts() = runTest {
        val repository = ImportExportRepository(api = FakeImportApi())
        val result = repository.previewImport(ByteArray(0))
        assertTrue(result.isSuccess)
        assertEquals(1, result.getOrNull()?.conflicts?.size)
        assertEquals(2, result.getOrNull()?.creates?.size)
    }
}
```

（`FakeImportApi` 为测试私有类，实现 `HomeInventoryApi` 全部方法；`previewImport` 返回包含 1 个冲突、2 个新增的 `ApiEnvelope(ok = true, data = ImportPreviewDto(...))`，其余方法返回空成功。）

- [ ] **Step 2: 运行测试确认失败**

Run: `gradle :app:testDebugUnitTest --tests "com.homeinventory.app.data.repository.ImportExportRepositoryTest" --no-daemon`
Expected: FAIL

- [ ] **Step 3: 实现 ImportExportRepository**

```kotlin
package com.homeinventory.app.data.repository

import com.homeinventory.app.core.network.HomeInventoryApi
import com.homeinventory.app.data.remote.ImportCommitRequest
import com.homeinventory.app.data.remote.ImportPreviewDto
import com.homeinventory.app.data.remote.ImportRowDto
import com.homeinventory.app.data.remote.ImportSummaryDto
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.MultipartBody
import okhttp3.RequestBody.Companion.toRequestBody

class ImportExportRepository(private val api: HomeInventoryApi) {
    suspend fun previewImport(fileBytes: ByteArray, filename: String): Result<ImportPreviewDto> {
        val fileBody = fileBytes.toRequestBody("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet".toMediaType())
        val part = MultipartBody.Part.createFormData("file", filename, fileBody)
        val response = try {
            api.previewImport(part)
        } catch (_: Exception) {
            return Result.failure(IllegalStateException("无法连接服务器，请检查网络"))
        }
        val body = response.body()
        if (!response.isSuccessful || body?.ok != true || body.data == null) {
            return Result.failure(IllegalStateException(body?.message ?: "导入预检失败"))
        }
        return Result.success(body.data)
    }

    suspend fun commitImport(
        rows: List<ImportRowDto>,
        conflictResolutions: Map<String, String>,
    ): Result<ImportSummaryDto> {
        val response = try {
            api.commitImport(ImportCommitRequest(rows, conflictResolutions))
        } catch (_: Exception) {
            return Result.failure(IllegalStateException("无法连接服务器，请检查网络"))
        }
        val body = response.body()
        if (!response.isSuccessful || body?.ok != true || body.data == null) {
            return Result.failure(IllegalStateException(body?.message ?: "导入失败"))
        }
        return Result.success(body.data)
    }
}
```

- [ ] **Step 4: 运行测试确认通过**

Run: 同 Step 2 命令，Expected: PASS

- [ ] **Step 5: 导入 UI 流程（ImportPreviewDialog + DashboardHost 接线）**

- 顶部「导入」→ SAF `OpenDocument`（`*/*`，过滤 xlsx/xls）→ 读 bytes → `previewImport` → 打开 `ImportPreviewDialog`。
- `ImportPreviewDialog` 显示：待新增 X 条、完全相同跳过 Y 条、冲突 Z 条、错误行列表；冲突行逐条显示「当前数据 vs Excel 数据」，三个选择（跳过 / 都保留 / 覆盖），默认跳过。
- 「确认导入」→ `commitImport(rows = preview.rows, conflictResolutions = 用户选择)` → 显示汇总：新增区域 X、新增位置 Y、新增物品 Z、覆盖 N、保留重复 M、跳过 K、失败行列表。
- 成功后 `repository.refreshSnapshot()` 刷新本地。

- [ ] **Step 6: 构建验证并提交**

Run: `gradle :app:assembleDebug --no-daemon`，Expected: BUILD SUCCESSFUL

```bash
git add android/app/src/main/java/com/homeinventory/app/data/repository/ImportExportRepository.kt android/app/src/main/java/com/homeinventory/app/ui/dashboard/dialogs/ImportPreviewDialog.kt android/app/src/test/java/com/homeinventory/app/data/repository/ImportExportRepositoryTest.kt
git commit -m "feat: excel import preview conflict and commit"
```

### Task 18: 导出落盘（SAF/MediaStore）

**Files:**
- Modify: `android/app/src/main/java/com/homeinventory/app/data/repository/ImportExportRepository.kt`（加 `exportBackup`）
- Modify: `android/app/src/main/java/com/homeinventory/app/ui/dashboard/DashboardHost.kt`（导出接线，本地 Composable 内）

- [ ] **Step 1: 实现导出**

```kotlin
suspend fun exportBackup(
    snapshot: InventorySnapshot,
    context: Context,
): Result<String> {
    val rows = snapshot.items.map { item ->
        BackupRow(
            index = snapshot.items.indexOf(item) + 1,
            name = item.name,
            locationName = item.locationName ?: "",
            areaName = item.areaId?.let { id -> snapshot.areas.firstOrNull { it.id == id }?.name } ?: "",
            note = item.note,
            expireDate = item.expireDate,
        )
    }
    val bytes = ExcelBackupGenerator.generate(rows)
    val filename = ExcelBackupGenerator.filename()
    return try {
        saveToDownloads(context, filename, bytes)
        Result.success(filename)
    } catch (error: Exception) {
        Result.failure(error)
    }
}

private fun saveToDownloads(context: Context, filename: String, bytes: ByteArray) {
    val values = ContentValues().apply {
        put(MediaStore.MediaColumns.DISPLAY_NAME, filename)
        put(MediaStore.MediaColumns.MIME_TYPE, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")
        put(MediaStore.MediaColumns.RELATIVE_PATH, Environment.DIRECTORY_DOWNLOADS)
    }
    val resolver = context.contentResolver
    val uri = resolver.insert(MediaStore.Files.getContentUri("external"), values)
        ?: throw IllegalStateException("无法创建导出文件")
    resolver.openOutputStream(uri)?.use { it.write(bytes) }
        ?: throw IllegalStateException("无法写入导出文件")
}
```

（需要 `android.permission.WRITE_EXTERNAL_STORAGE`？Android 10+ 用 MediaStore 不需要权限，写入 Downloads 目录即可。）

- [ ] **Step 2: 接线「备份」按钮**

顶部「备份」→ `scope.launch { importExportRepository.exportBackup(state.snapshot, context) }` → 成功显示文件名提示，失败显示错误。

- [ ] **Step 3: 构建验证并提交**

Run: `gradle :app:assembleDebug --no-daemon`，Expected: BUILD SUCCESSFUL

```bash
git add android/app/src/main/java/com/homeinventory/app/data/repository/ImportExportRepository.kt android/app/src/main/java/com/homeinventory/app/ui/dashboard/
git commit -m "feat: export backup xlsx to downloads"
```

---

## 阶段 5：收尾验证与文档

### Task 19: 全量 Android 验证 + 服务端回归

- [ ] **Step 1: Android 全量单测**

Run: `gradle :app:testDebugUnitTest --no-daemon`
Expected: BUILD SUCCESSFUL，所有测试通过

- [ ] **Step 2: APK 构建**

Run: `gradle :app:assembleDebug --no-daemon`
Expected: `android/app/build/outputs/apk/debug/app-debug.apk` 生成

- [ ] **Step 3: 服务端回归**

Run（仓库根）：`npm test`（必要时清空 `TEST_DATABASE_URL`/`DATABASE_URL`）+ `npm run lint`
Expected: 通过

- [ ] **Step 4: 提交**

```bash
git add android/
git commit -m "chore: android dashboard alignment complete"
```

### Task 20: 真源记录与推送

- [ ] **Step 1: 更新 `dev-docs/acceptance.md`**：追加「2026-08-05 Android 界面对齐与离线同步实现证据」段落，记录代码文件、测试命令与结果、构建产物路径、剩余未验证（真机点击验收）。
- [ ] **Step 2: 更新 `dev-docs/README.md` 当前阶段**（如适用）。
- [ ] **Step 3: 提交并推送**

```bash
git add dev-docs/
git commit -m "docs: record android dashboard alignment implementation"
git push origin main
```

- [ ] **Step 4: 向用户交付真机验收清单**（自动登录、在线 CRUD、搜索/筛选/排序/过期、导出/导入、断网离线编辑、恢复自动同步、冲突提示、退出清理），并说明服务器无需变更。
