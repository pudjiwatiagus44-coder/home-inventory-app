# 家庭物品 Android 个人 API 设置

## 状态与来源

2026-10-07：用户要求新增设置按钮、支持自己的 DeepSeek API，并复用 `G:\AI项目集合\记账软件` 的实现；用户回复“确认”。本方案按 Android 与现有物品识别流程整理，具体复用边界已由用户回复“继续”确认，本地实现与自动化验证已完成，未操作数据库或生产环境。

## 产品范围

2026-10-07 追加：用户要求所有输入框最右侧增加“×”一键清除。本轮 Android 所有可编辑输入框统一接入清除组件，空值隐藏、禁用时不能清除；日期选择字段也支持清除日期。只读下拉选择保留原下拉交互。

- Android 清单页新增“设置”入口，打开可滚动设置弹窗。
- 识别服务可选择“默认豆包”或“个人 DeepSeek”，默认仍为豆包。
- DeepSeek 设置提供密码式输入、保存、检查连接、掩码状态、删除；保存成功与连接验证成功分别展示，不把保存成功当作验证通过。
- 切换 DeepSeek 前说明：主动识别的照片会发送至 DeepSeek，调用费用由个人 API 账号承担。未配置 Key 不允许启用。
- 个人 DeepSeek 用于物品名称、备注和日期识别；纯照片缩略图保存不调用模型。草稿后台识别使用创建识别任务时确定的服务选择。
- Key 不保存在手机明文配置、日志或离线队列。服务选择按登录账号保存，切换账号不得沿用其他账号的选择。
- 本轮仅本地实现与验证；Web 设置入口、生产迁移、部署及 APK 上传不在本轮授权内。

## 复用方案与取舍

采用现有记账凭据托管接口 `/api/bookkeeping/deepseek-credential`、AES-256-GCM 服务与账号隔离策略；按家庭物品 App 的 Retrofit、会话和 Compose 结构适配源项目界面，避免复制源项目认证实现。

同一登录账号在记账 App 与物品 App 共用一份 DeepSeek 凭据。保存或删除会影响两端，设置界面明确提示。此项扩展原 `bookkeeping-deepseek-hosted-key-design.md` 的“只用于记账”边界，只允许库存识别在服务端用当前会话账号调用已有解密方法；不共享不同账号 Key，不向库存接口返回明文。

备选：独立库存凭据表可以隔离两个 App，但需要新 schema 与迁移；手机本地存 Key 无法复用当前跨设备托管方案。本轮推荐复用现有托管，避免新增数据库结构。

## 服务端边界

- 新增已登录可读的 `GET /api/recognition` 返回 provider 能力；客户端使用 DeepSeek 前先检查，旧服务器未提供此能力时禁止发送图片。新版识别返回请求中明确指定的 provider，客户端复核一致性，防止旧接口忽略参数造成虚假切换。

- `/api/recognition` 增加非敏感 provider 参数，允许 `DOUBAO` / `DEEPSEEK`，缺省保持豆包；其他值返回 400。
- 必须先认证，再根据会话 userId 读取凭据。禁止使用请求 userId 取 Key，禁止将家庭 owner 的 Key 提供给其他成员。
- DeepSeek 固定调用 `https://api.deepseek.com/chat/completions`，模型 `deepseek-flash`，禁用思考模式。使用独立库存提示与解析器，不能复用记账分类输出合同。
- 仅发送本次主动识别所需图片和提示，不发送整个物品清单或其他家庭数据。
- 缺失凭据、认证失败、限流、超时和上游异常返回脱敏提示，不记录原始图片、Key 或完整上游错误。设置页应区分登录失效与上游 Key 无效。
- 不自动换模型兜底；后台草稿失败明确展示失败状态。
- 原有照片归属、缩略图保存与家庭权限行为不因服务切换而改变。

## 验收

1. Android 设置入口可达，弹窗可滚动，Key 输入遮罩；保存后清空输入，关闭时清空；处理中禁止重复提交，异常后恢复按钮。
2. 掩码读取、保存、独立验证、删除分别符合现有接口合同；离线提示、未登录提示与 Key 无效提示正确。
3. 当前账号读取自己的凭据；切换账号后服务选择不串号；Key 不写入本地持久化或日志。
4. 服务端证明：无 provider 的旧请求不回归、非法 provider 拒绝、未登录不解密或请求上游、账号 A/B 凭据隔离、DeepSeek 请求模型与图片正确、错误脱敏、超时终止请求、输出无法识别时不伪造结果。
5. 名称、日期、草稿识别传递所选服务；纯照片模式不触发模型调用。
6. 运行相关 Vitest、lint、TypeScript 检查及 Android 单元测试和 debug 构建。真实 Key 的连通性与真机体验由用户后续确认，不声明已验证。

## 参考

- 源客户端：`G:\AI项目集合\记账软件\app\src\main\java\com\codex\bookkeeper\ui\settings\DeepSeekCredentialSettingsSection.kt`。
- 当前服务：`src/features/bookkeeping/deepseek-credential-service.ts` 与 `src/app/api/bookkeeping/deepseek-credential/handlers.ts`。
- DeepSeek 图片输入官方说明：https://api-docs.deepseek.com/zh-cn/guides/vision/ （2026-10-07 查阅）。
