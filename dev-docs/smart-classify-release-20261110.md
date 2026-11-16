# 双击智能分流 `/classify` 发布记录

日期：2026-11-10

用户明确要求“继续，然后尽快上线我试试”，授权部署服务端智能分类接口并发布 Android 试用包。本次只新增 `/api/bookkeeping/classify` 的无状态文本分类能力，不修改数据库 schema、密钥、账号数据、用户正文或库存业务。

## 发布内容

- Android 双击使用 `SMART` 模式：本地 OCR 与脱敏后调用 `/api/bookkeeping/classify`，仅 `translation` 且置信度不低于 `0.60` 进入翻译，其余默认记账。
- 记账结果卡提供“翻译”小按钮；翻译气泡仅对智能会话提供“记账”小按钮。两者复用同一份内存 OCR，不重新截图。
- 分类失败、超时或非法响应自动回退记账；服务端只接受 `text/provider/credentialMode`，沿用现有 `X-Bookkeeping-Token`、Cookie、服务商与额度规则。

## 本地验证

- 分类与翻译回归：4 个 Vitest 文件、23 项测试通过。
- 干净单测集：排除旧 `.worktrees` 和需要本机 PostgreSQL 的集成测试后，89 个测试文件、662 项测试通过。全仓 `npm test` 会扫入 `.worktrees` 并因本机 5432 未启动失败，不作为本次代码失败证据。
- 修改文件 ESLint 通过。
- 生产构建成功，Build ID `K4ASw_fH2tFDVDeXNkFpE`，构建产物包含 `/api/bookkeeping/classify`。
- 发布包 `next-build-smart-classify-20261110.tar.gz`：1,586,952 字节，SHA-256 `4BB6A48C540DAD80224AD8B44CED6E73B34A9BA16F6CDCC28C027E0210D7647C`；上传后服务器校验一致。

## Staging 与生产冒烟

- staging 独立端口 3109：登录页 200；未授权 classify 401；非法 `image` 字段 400；既有翻译接口 200、返回 2 个分句和英文检测。
- 真实豆包平台额度合成样本：付款记录判为 `bookkeeping`，置信度 0.98；英文采访正文判为 `translation`，置信度 0.95；模型 `doubao-seed-2-0-mini-260428`。
- 生产切换后公网复测：登录页 200，付款 0.98，英文采访 0.95，未授权 401；`home-inventory-app` 为 active，最近 5 分钟错误级日志 0 条。
- 未使用真实账本、真实 OCR 正文或真实个人 API Key 做冒烟。

## 备份与回滚

- 备份目录：`/opt/home-inventory-backups/bookkeeping-smart-classify-20261110/`。
- 应用 archive SHA-256 `7b30c54ca0cb1dcfcc2261e4140f5a3b99a26047a397702269d55405a79051c9`。
- 数据库 dump SHA-256 `3746b663889736252c8d1959cee7a4c33b338c9f5b45571c4ef02068f3035858`，`pg_restore --list` 可读。
- 上一版生产构建：`/opt/home-inventory-app/.next.previous-smart-classify-20261110`。回滚时停止服务、交换 `.next`、重启并复测。
- 服务器原剩余空间仅 141 MB；清理确认无 `data/public` 用户数据的旧发布目录 `/opt/home-inventory-app-release-20260715_020204`，释放约 793 MB。未删除数据库、照片、当前或上一版构建。

## Android 0.1.84 发布

- 版本：`0.1.84/code 84`，156,179,142 字节，SHA-256 `5E4A8316C2B202561771527CD13D1C1F65982387FD718CAFBAEEE8E10C01F024`。
- 866 项 JVM、Lint 与 Debug APK 构建通过；模拟器 8 项定向仪器测试通过。
- 公网 `https://homestorag.xyz/apk/smart-bookkeeper-latest.apk` 完整重下载：HTTP 200、MIME `application/vnd.android.package-archive`、大小与 SHA-256 均与本地一致。
- `codex_acceptance` 模拟器覆盖安装显示 `0.1.84/code 84`，冷启动到 `MainActivity`，未发现 FATAL EXCEPTION。

## 未验证

- 真实页面分布的 AI 分类准确率和延迟。
- 真机双击授权、端到端分流、结果卡软删除切换、翻译气泡切回记账、大字体、深色模式和 TalkBack。
- 未使用真实个人 API Key 验证个人额度路径；本次生产冒烟使用平台额度。
