# Android 内测版界面对齐移动网页端与离线同步设计

日期：2026-08-05

## 背景

Android 内测版当前只完成「登录 + 拉取快照展示物品列表 + 刷新」，用户反馈两个问题：

1. 账号不会自动保存，App 重启后必须重新输入邮箱密码登录。
2. 登录后只有物品列表，缺少移动网页端（`/app`）的区域、位置、物品增删改、搜索、过期提醒、Excel 导入导出等功能。

用户已确认本次要做的范围：

- 自动保存 session 并自动登录。
- Android 端界面与交互完整对齐移动网页端（含 Excel 批量备份与导入）。
- 离线能力本次一起实现（离线查看、离线增删改、网络恢复自动同步、冲突不覆盖服务器新数据）。
- 实施方法采用分层推进（会话层 → 数据与同步层 → UI 对齐层 → Excel 层），每层可测试、可安装验证。

## 目标与范围

本次交付目标：Android 内测 APK 在功能、交互和视觉上与移动网页端一致，且具备离线缓存与离线编辑能力。

范围：

- 邮箱 + 密码登录、退出登录。
- session 持久化与自动登录。
- 区域 / 位置 / 物品的在线增删改。
- 搜索、区域/位置筛选、排序、过期提醒。
- 移动端四个快捷入口形态（搜索栏、区域条、位置条、悬浮新增按钮）。
- Excel 批量备份（导出）与批量导入（预检、冲突选择、汇总）。
- 离线查看最近同步清单。
- 离线新增、编辑、删除区域 / 位置 / 物品，网络恢复后自动同步。
- 冲突策略：服务器优先，离线编辑/删除不覆盖服务器较新数据。

不做的事（沿用既有边界）：

- iOS、应用商店上架、正式签名发布。
- 推送通知、照片上传、扫码识别、AI 识别、家庭共享、支付、管理员后台。
- 独立移动端账号系统（复用现有邮箱密码账号与后端权限边界）。
- Android 直连 PostgreSQL 或保存任何服务端密钥。
- 桌面端三栏布局的复刻（Android 为手机窄屏形态）。

## 总体架构

沿用现有 Kotlin + Jetpack Compose + MVVM 分层：

- UI 层：Compose 屏幕与弹窗，对应 Web 移动端各区块。
- ViewModel 层：页面状态、表单校验、加载/错误/离线/冲突状态。
- 仓库层：在线与离线操作的统一入口；内部协调 Room 与远程 API。
- 数据层：Room 五张表（areas / locations / items / pending_operations / sync_state）。
- 安全存储层：session cookie 存 EncryptedSharedPreferences，不存密码。
- 网络层：现有 Retrofit/OkHttp + Cookie 拦截器；新增导入相关接口封装。

数据流：

```text
登录/启动
  -> 拉取快照（带 session）
  -> 写 Room
  -> UI 从 Room 观察展示
  -> 用户操作：写 Room + 入待同步队列
  -> 在线：立即提交，成功后用服务端 id/updatedAt 替换本地
  -> 离线：等网络恢复自动提交，冲突按服务端版本校验
```

## 账号自动登录

- 登录成功后把 `home_inventory_session` cookie 写入 EncryptedSharedPreferences。
- App 启动时读取 cookie，带 cookie 请求快照验证：
  - 有效：直接进入清单界面。
  - 401 / 失效：清除本地 session 与 Room 数据，回到登录页。
- 退出登录：调用 `POST /api/auth/logout` 撤销 session，清除本地 session 与 Room 数据。
- 不保存明文密码；session 失效后必须重新登录。

## 界面与交互对齐清单

以 Web 移动端（窄屏 `/app`）为基准，Android 端实现：

### 主界面（从上到下）

1. 顶部栏：家徽标 +「家中清单」标题，右侧「备份」「导入」「退出」。
2. 搜索栏：占位「搜索物品（名称 / 类别 / 位置 / 备注）」，输入即过滤。
3. 区域横向条：区域色点 + 名称 + 物品数；点击筛选物品并联动位置条；末尾「+ 新增区域」。
4. 位置横向条：位置名 + 物品数；点击筛选；选中区域后可「全部区域」清除；末尾「+ 新增位置」。
5. 物品列表：排序下拉（按过期日 ↑ / 按过期日 ↓ / 按名称）；物品行 = 首字色块 + 名称 + 位置/备注 + 过期日期 + 状态（已过期 / 即将过期 / 正常）；点击行打开编辑。
6. 右下角悬浮「+ 新增」圆形按钮。

### 弹窗

- 搜索物品：搜索框 + 区域筛选 + 位置筛选 + 匹配结果列表。
- 新增 / 编辑物品：名称（必填，≤120）→ 区域（含「未分区」）→ 位置（按区域联动，未选区域不可选）→ 备注（≤1000）→ 过期日（日期选择器）；按钮文案「保存物品 / 保存修改」。
- 新增位置：名称（必填，≤80）+ 所属区域（可未分区）。
- 新增区域：名称（必填，≤80）+ 颜色选择（颜色盘与 Web 一致）。
- 编辑区域 / 编辑位置：复用上述表单，带「取消 / 保存修改」。
- 导入预览：预检结果汇总、冲突行对比、逐行选择「跳过 / 都保留 / 覆盖」、「确认导入」。

### 空状态与提示

- 无任何数据：「先创建区域和位置，再添加第一个物品。」
- 筛选无结果：「没有匹配的物品。」
- 表单校验错误、网络错误、权限错误、同步冲突均展示明确中文提示。

### 视觉

- 使用 Web 同一套主题色与卡片风格：白底、圆角卡片、细边框、青绿主色、首字色块、悬浮按钮。
- Android 通过 Material3 自定义 colorScheme 与组件尺寸复刻，不做像素级 1:1，但布局顺序、字号层级、间距与交互保持一致。

## 数据模型（Room）

### areas

- id（本地主键）、serverId、householdId、name、color、sortOrder、serverUpdatedAt、localUpdatedAt、syncStatus。

### locations

- id（本地主键）、serverId、householdId、areaId、name、sortOrder、serverUpdatedAt、localUpdatedAt、syncStatus。

### items

- id（本地主键）、serverId、householdId、locationId、name、note、expireDate、serverUpdatedAt、localUpdatedAt、syncStatus。

### pending_operations

- clientOperationId、entity（area/location/item）、action（create/update/delete）、localId、serverId、baseServerUpdatedAt、payloadJson、state（pending/applied/conflict/failed）、errorMessage、createdAt。

### sync_state

- key/value 形式记录最近同步时间与状态，供启动时判断「先展示本地缓存再后台刷新」。

## 同步规则

触发点：登录成功、App 启动、手动刷新、网络恢复、在线操作成功。

- 在线操作：直接调用现有 API（与 Web 行为一致），成功后更新本地 Room。
- 离线操作：写 Room 并加入 pending_operations；界面显示「待同步」标记。
- 网络恢复：按队列顺序自动提交；create 成功后用服务端 id/updatedAt 替换本地临时 id。
- 冲突：update/delete 提交时携带 baseServerUpdatedAt；服务端返回 conflict 时客户端不覆盖，显示冲突提示，用户刷新后重新确认。
- 启动：有本地缓存先展示，再后台拉快照刷新。

## Excel 导入导出

### 导出

- 生成 `物品清单_YYYY-MM-DD_HH-mm-ss.xlsx`。
- 表头与 Web 一致：`序号 / 名称 / 格子编号 / 所在区域 / 备注 / 有效期`。
- 数据来自当前用户自己的本地/服务器清单，不含其他用户数据。
- Android 通过系统保存/分享（SAF 或 MediaStore）落盘。

### 导入

- 系统文件选择器选择 `.xlsx / .xls`。
- 客户端解析并预检：以 `所在区域 + 格子编号 + 名称` 判断同格同名；备注与有效期完全相同自动跳过；不同则弹窗对比，用户选择「跳过 / 都保留 / 覆盖」；全新物品自动导入并按需创建区域/位置。
- 有效期支持 `YYYY-MM-DD` 与 `YYYY-MM`（只有年月时按当月 1 号）。
- 提交复用现有 `POST /api/inventory/import`（preview / commit），服务端以当前 session 推导 household，客户端不提交可信 householdId。
- 完成后显示：新增物品数、覆盖数、保留重复数、跳过数、新增区域数、新增格子数、失败行数。

## 错误处理

| 场景 | 处理 |
| --- | --- |
| 会话失效 / 401 | 清除本地 session 与 Room，回登录页 |
| 无网络 / 服务器不可达 | 明确提示，可继续浏览与编辑本地数据 |
| 表单校验 | 名称必填、长度限制，表单内提示 |
| 权限错误 | 明确提示，不暴露内部信息 |
| 同步冲突 | 冲突状态，提示刷新后重新确认 |
| 待同步失败项 | 列表内失败/冲突标记 + 可重试 |

服务端错误不向用户暴露数据库 URL、堆栈或原始 SQL。

## 测试与验收

单元测试覆盖：

- session 持久化与自动登录判定。
- 仓库：快照落库、在线增删改、离线队列写入。
- 同步引擎：网络恢复自动提交、成功替换本地 id、冲突与失败标记。
- 表单校验（必填、长度、日期）。
- Excel 解析（表头、日期格式、同格同名判断）与生成。

构建验收：

- `gradle :app:testDebugUnitTest --no-daemon` 全绿。
- `gradle :app:assembleDebug --no-daemon` 成功产出 debug APK。
- 服务端相关契约测试（如移动同步接口）保持通过。

真机验收清单：

- 登录一次后重启 App 自动登录。
- 区域 / 位置 / 物品在线增删改。
- 搜索、区域/位置筛选、排序、过期提醒。
- 导出 Excel 并可打开查看。
- 导入 Excel：预检、冲突选择、确认导入、结果汇总。
- 断网：可查看最近清单，可新增/编辑/删除；恢复网络后自动同步。
- 冲突：两台设备（或先改服务器）后，离线编辑不覆盖服务器较新数据，显示冲突提示。
- 退出登录后本地数据与 session 清除。
- 权限负例：用户 A/B 数据隔离仍由服务端保证，Android 冒烟确认。

## 实施阶段

1. 会话层：EncryptedSharedPreferences 自动登录 + 启动校验 + 退出清理。
2. 数据与同步层：Room 五表、快照落库、在线 CRUD 仓库、离线队列、同步引擎、冲突处理、网络恢复监听。
3. UI 对齐层：主界面、区域/位置条、物品列表、排序、搜索、全部表单弹窗、空状态与提示。
4. Excel 层：导出生成与保存、导入文件选择、解析预检、冲突弹窗、提交与汇总。

每阶段完成均有单元测试与可安装 APK，最后整体真机验收并写回 `dev-docs/acceptance.md`。

## 安全边界

- 不保存明文密码、数据库密码、service role key、私钥或真实云密钥。
- session cookie 仅存 EncryptedSharedPreferences。
- 所有请求走 HTTPS；客户端不提交可信 householdId。
- 用户数据隔离继续由服务端 session + 权限校验保证。
