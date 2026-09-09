# 记账回收站错误订单上报设计真源

## 状态与范围

- 2026-09-10 已完成生产迁移、私有目录、精确反代上限、服务部署、未登录鉴权和一次真实 Android 15 账号端到端上传验收。
- 用户可在 Android 回收站主动提交一笔错误订单，用于后续受控的人工或 AI 分析。该报告不属于正常账本数据。
- 图片识别订单在 Android 私有目录保存压缩 JPEG 来源图 30 天；文字记账和手动录入无图。用户必须预览、选择原因并明确确认，服务端才接收上传。
- 成功的服务器记录与图片永久保留，直至用户明确要求维护人员删除；本机图片满 30 天未上报即删除，本机订单永久删除也删除剩余本机图片。
- 本能力不得复用或读取 `bookkeeping_recognition_feedback`，不得写入/读取同步交易或 `bookkeeping_delete_tombstones`，不得作为豆包上下文或训练样本。

## 账号、幂等与数据边界

- 客户端为每安装、每笔订单持久化稳定 UUID `reportId`。服务端以当前登录会话解析账号，复合键 `(account_id, report_id)` 保证同一请求重试幂等；`account_id` 外键必须为 `RESTRICT/NO ACTION`，客户端不得提供 `accountId`。
- 未同步订单也允许报错：`localTransactionId` 必填，`serverTransactionId` 可为空。服务端不得要求先同步交易。
- 报告保存结构化 `snapshot`、原因、可选说明、授权时间和图片对象键/哈希。快照只限订单字段：金额、收支、分类、商户或备注、交易时间、删除时间和必要来源状态。
- 不得接收或记录 OCR 原文、识别置信度、屏幕截图、账户号、设备 ID、凭据、其他订单或无关文件。服务日志和错误响应不得回显报告正文或图片。
- `reason` 固定为 `mistaken_delete`、`wrong_amount`、`wrong_category`、`other`；`note` 最多 1000 字。

## 服务端存储与维护

- 新表 `bookkeeping_transaction_error_reports` 的唯一迁移真源为 `dev-docs/sql/bookkeeping_transaction_error_reports_20260908.sql`。
- 图片只可写入固定非公开目录 `/opt/home-inventory-app/data/bookkeeping-error-reports`。禁止写入 `public/`、静态文件目录、账本同步目录或日志。
- 上报请求仅接受 multipart，总请求体上限为 `2MiB + 64KiB multipart 开销`（`2,162,688` 字节）；应用在 `formData()` 前按 `Content-Length` 预拒绝，并对无 `Content-Length` 的 chunked body 作流式累计限额。生产 Nginx 已对 `location = /api/bookkeeping/error-reports` 设置 `client_max_body_size 2112k`，全局较大的图片识别上限不会放宽该接口。
- 未来上报接口必须在当前会话账号内鉴权；重复 POST 返回已有记录，不新建行、不覆盖已保存内容或图片。
- 文件写入后若数据库插入失败，或幂等并发冲突后多余文件删除失败，服务只记录账号、随机图片对象键、固定错误码和时间到 PostgreSQL 的 `bookkeeping_error_report_file_cleanup` 受控待清理队列；不得存订单正文、绝对路径或图片内容。队列以唯一对象键幂等入队，并以数据库原子 claim/租约跨请求、多进程领取；删除成功才删队列行，失败仅更新固定错误码、次数和时间。入队数据库失败时写固定结构化 `console.error` 事件（无路径、对象键或内容），同时保留原数据库失败语义、不回显订单内容。服务提供维护重试；每次已鉴权上报前会重试该队列。该队列与维护重试均不得提供 App 查询/下载接口。
- 不对 App 提供常规查询或删除接口。用户明确提出清理后，受控维护操作须同时物理删除数据库行和对应文件；任一步失败都必须记录错误并停止，不得声称删除成功。账户删除不得使用级联删除绕过此流程，必须先完成同一受控的行与文件清理，才可删除账户。

## 数据库、发布与验证门禁

- SQL 仅新增错误订单报告表、其账户时间索引和附件补偿队列表/claim 索引，并必须把两张新表的运行时读写权限授予生产应用角色 `home_inventory_app`；不修改库存、认证、同步交易、识别纠错或删除墓碑表。
- 执行任何测试/生产迁移前，必须先备份、验证备份可读、在隔离数据库执行迁移与账号隔离负例；生产迁移、文件目录创建、服务部署或重启都需要用户再次明确确认。
- 2026-09-09 生产验证：完整 PostgreSQL 备份 `192K`；报告表 11 列、补偿队列表 8 列；私有目录 `/opt/home-inventory-app/data/bookkeeping-error-reports` 为 `deploy:deploy 700`；服务 `active`；主页返回 200；未登录 `POST /api/bookkeeping/error-reports` 返回 401。
- 2026-09-09 首次真实账号上报返回 500。根因已实证为两张迁移表由 `postgres` 创建且 ACL 为空，运行角色 `home_inventory_app` 对报告表及补偿队列表均无权限。迁移真源已增加最小运行时 `GRANT`，生产库已执行授权；随后以服务进程的真实 `DATABASE_URL` 和 `home_inventory_app` 角色验证两表权限均为 true，报告插入探针成功后在同一事务回滚，`deploy` 对私有图片目录的写入/删除探针成功。修复无需服务重启。
- 2026-09-10 权限修复后真实上传成功：接口于北京时间 `04:02:51` 返回 200；数据库新增 1 条报告；对应私有 JPEG 为 `612×1251`、`58772` 字节，文件实算 SHA-256 与数据库记录一致。核对过程未读取或输出订单正文和截图内容。
- 账号隔离负例及后续 AI 分析/人工物理删除流程尚未执行，继续标记为**未验证**。
