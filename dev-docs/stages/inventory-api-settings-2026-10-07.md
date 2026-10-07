# 个人 API 设置实施计划

目标：Android 提供设置与个人 DeepSeek 管理，库存识别使用所选 provider。
架构：复用既有账号凭据接口；库存独立视觉客户端；Android 通过既有会话 Retrofit 调用。
技术：Next.js/TypeScript/Vitest，Kotlin/Compose/Retrofit/JUnit。

- [x] 服务端测试先行：视觉响应解析、密钥隔离、超时、缺少凭据、路由 provider 校验与旧合同兼容。实现 `src/server/recognition/deepseek-vision.ts`，在 recognition service/handlers 中接入按 userId 延迟创建的客户端；photo 模式不解密。
- [x] Android 测试先行：设置仓库契约与错误映射、账号隔离选择、直接识别/草稿传参。创建 `data/recognition/RecognitionSettings.kt`、`data/repository/DeepSeekSettingsRepository.kt`；在 HomeInventoryApi 增加凭据方法与 provider query。用已有 SessionStore 与新会话相关的选择命名空间保证不串号，登出后旧会话选择不可用。
- [x] UI：新增 `ui/dashboard/dialogs/ApiSettingsDialog.kt`；TopBar 增加设置与更多菜单；AppRoot 注入设置依赖。Key 只存在弹窗输入状态，关闭/提交后清空，协程结束恢复按钮。
- [x] 草稿：用非敏感 SharedPreferences 元数据记录任务创建时 provider 与会话标识，不改 Room schema；失败状态写入既有 status 字段。已登出的会话任务禁止使用新会话凭据。
- [x] 验证：`npx vitest run`（排除 PostgreSQL 集成文件），`npx eslint src`，`npx tsc --noEmit --incremental false`；`android/gradlew.bat :app:testDebugUnitTest :app:assembleDebug --console=plain`。记录实际结果，同步真源与使用说明。

执行：当前对话逐项实施，功能分支 `codex/inventory-api-settings`。不操作生产、真实 Key 或上传 APK。
