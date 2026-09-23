# 记账千问个人 API 加密托管设计

## 状态与范围

- 2026-09-23：用户已确认在 Android 记账 App 中增加“豆包 / 千问 / DeepSeek”显式单选及各自的个人 API 管理。本文件记录服务器侧千问凭据与请求路由合同。
- 原状态要求生产数据库备份/迁移、服务部署和重启另行确认；2026-09-23 用户针对全模型重新识别失败回复“继续”，已明确授权本轮先备份，再应用所需千问表迁移并部署当前已验证的服务端识别合同修复。授权仅限记账凭据/识别路由，不包括无关业务、读取/处理真实订单图像或真机 API Key 配置。
- 本设计只作用于记账 `bookkeeping_*` 凭据与识别端点，不改变库存、家庭共享、认证核心或其他业务接口。
- 本地凭据与 API 服务、显式 provider 路由及输入校验已实现并完成目标测试/lint。2026-09-23 数据库备份后已执行 Qwen 凭据/限流表 migration，并部署兼容 provider/credentialMode 的服务端代码；服务器构建反复卡住，最终改用本地已验证 build 输出。

## 账号与密钥边界

- 新增独立表 `bookkeeping_qwen_credentials`，每个 `user_id` 唯一一条，字段包括加密格式版本、AES-256-GCM 密文、随机 nonce、认证 tag、掩码后缀、最后验证时间及审计时间；禁止明文落库。
- 沿用现有 `BOOKKEEPING_CREDENTIAL_MASTER_KEY` 的服务器加密托管方案；不得在 Git、测试输出、HTTP 响应、应用日志、数据库导出或 Android 偏好中保存主密钥/完整 API Key。
- GET/PUT/POST/DELETE 凭据接口均从 `home_inventory_session` 推导当前用户，拒绝客户端提供或覆盖 `user_id`。状态最多返回配置状态、脱敏后缀和验证结果；DELETE 物理删除该账号凭据。
- 只有已认证用户可配置自己的 Key。解密只在实际调用阿里云 DashScope 兼容 API 的进程内短暂发生；错误响应使用稳定且脱敏的错误码，不包含密钥、OCR 正文或模型原始响应。
- 数据库迁移必须最小授权应用运行角色，只授予新增表运行所需权限；生产迁移前必须备份并验证备份可读。
- `/api/bookkeeping/qwen-credential` 的 PUT/POST 对每账号实行共享数据库限流（10 分钟最多 5 次，并发 1）；限流事件/运行租约保存在新表中，并通过事务级 advisory lock 实现跨进程原子 admission/release。PUT/POST 与删除也按账号使用 advisory transaction lock 线性化。

## HTTP 合同

新增受保护端点 `/api/bookkeeping/qwen-credential`：

- `GET`：返回当前会话账号的掩码状态。
- `PUT`：验证非空 Key，做最小连通性校验后以 AES-256-GCM 加密覆盖保存，并返回掩码状态。
- `POST`：使用当前账号已保存的 Key 发送不含用户数据的最小验证请求。
- `DELETE`：删除当前账号托管的千问 Key。
- 未登录一律返回 401；其他稳定错误码至少区分 `invalid_key`、`timeout`、`provider_unavailable`、`invalid_request` 和 `internal_error`。响应不得回显 Key 或上游敏感正文。

识别请求显式包含：

```json
{
  "provider": "DOUBAO | QWEN | DEEPSEEK",
  "credentialMode": "PLATFORM | PERSONAL"
}
```

- `QWEN + PERSONAL`：只读取当前会话用户的千问凭据；未配置即返回 `PERSONAL_API_REQUIRED`，不得转用平台千问 Key 或其他服务商。
- `DEEPSEEK + PERSONAL`：沿用现有 DeepSeek 用户托管 Key 路径。
- `DOUBAO + PLATFORM`：沿用豆包平台额度；`DOUBAO + PERSONAL` 沿用豆包个人 Key。
- 非法组合、凭据缺失、上游 Key 无效或超时必须返回明确、脱敏结果；服务端不得跨服务商自动回退。识别响应应带实际服务商标识，Android 校验响应服务商与请求选择一致。
- 文本优先发送用户主动触发取得的 OCR 文本和必要分类上下文；图像只在用户明确主动选择并依照现有确认门禁时用于视觉识别，不落库、不进入 Key 表、不写日志。

## 验收门槛

本地自动化至少验证：

1. 未登录凭据请求 401；账号 A/B 隔离；A 的 Key 不可由 B 读取、验证或调用。
2. SQL 服务层只保存密文/nonce/tag 与掩码；密文不同于明文；日志和响应不出现测试 Key。
3. PUT 保存、GET 掩码、POST 最小验证、DELETE 删除及删除后的 `PERSONAL_API_REQUIRED`。
4. 千问个人请求使用会话用户的解密 Key；千问未配置时不得读取平台 Key；豆包、DeepSeek 既有路径不回归。
5. 三服务商跨服务商回退为零；错误码稳定脱敏；文字与视觉识别都校验 provider/credentialMode。
6. 使用隔离 PostgreSQL 数据库测试迁移、权限与删除。不得为了本地验证连接生产数据库。

生产数据库迁移、服务部署、重启以及真机 API Key 保存验证必须在上述测试和备份方案完成后另行取得用户确认。2026-09-23 用户已确认本轮服务器更新；真机 API Key 保存验证不在授权范围，仍为“未验证”。

## 本地实现与验证记录（2026-09-23）

- 千问账号凭据加密存储与接口、provider/credentialMode 显式路由、PostgreSQL 限流/写入串行及 understanding 请求合同校验已在本地实现并完成代码复核。
- 服务端全量 Vitest：85 个测试文件通过，615 项通过、5 项跳过。`npm run build` 成功。
- 本轮未向进程提供数据库连接环境变量，因此没有连接真实或隔离 PostgreSQL；数据库 migration、并发集成验证以及生产部署均仍为未验证。
- `tsconfig.tsbuildinfo` 是工作区既有未提交修改，不属于本功能变更。
- 全 provider 重试失败诊断与修复：当前 Android 重新识别 multipart `request` 必含 `credentialMode`；旧服务端 parser 的 allowlist 仅包含 `provider` 而不接受该字段，会在模型调用前返回 400。兼容 parser `3439c5a` 已部署；自动视觉兜底对截屏/相册最多执行一次，失败后不循环。
- 2026-09-23 部署结果：数据库备份 `/opt/home-inventory-backups/bookkeeping-retry-fix-20260923T052425Z/home_inventory_test.dump` 已验证，新增 Qwen 凭据和限流表 migration 已执行。使用 Build ID `Lc4ed1o-QEoqQ4y_YllpD` 的本地 build 输出部署，systemd `home-inventory-app` active，页面/API 路由 smoke 正常；旧应用保留为 `/opt/home-inventory-app-backup-before-recognition-20260923T1835Z`。未调用模型 API、未上传真实交易内容或 API Key。已部署合同修复但真实登录后的模型识别端到端仍未验证；本次未发布 Android APK。
