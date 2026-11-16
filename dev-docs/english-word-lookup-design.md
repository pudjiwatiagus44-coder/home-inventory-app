# 英文点词查询接口真源

状态：2026-11-10 用户确认在页面翻译气泡内点击英文单词查询词卡。`POST /api/bookkeeping/word-lookup` 已实现、部署并通过 staging 与公网冒烟；真机点词体验、真实页面端到端、大字体、深色模式和 TalkBack 在取得证据前保持 `未验证`。

## 目标与边界

- 复用现有 `X-Bookkeeping-Token`、登录 Cookie、豆包/千问/DeepSeek 路由和额度规则。
- 只接收一个英文单词及其所在单句，不接收整页 OCR、截图、图片、账本、设备 ID 或账号 ID。
- 不保存请求正文、单词、句子和查询历史，不写数据库，不记录正文日志。
- 输出固定为英文，适合在翻译气泡内展示。
- 不自动重试，避免重复计费。

## 请求合同

`POST /api/bookkeeping/word-lookup`

```json
{
  "word": "advocate",
  "context": "In the video, a peaceful advocate is interviewed at a rally.",
  "provider": "DOUBAO",
  "credentialMode": "PLATFORM"
}
```

- 字段白名单：`word`、`context`、`provider`、`credentialMode`。任何额外字段返回 400。
- `word` 去首尾空白后必须匹配英文 token：字母开头，内部可含撇号或连字符，最长 64 字符。
- `context` 去首尾空白后非空，最长 1,000 字符；按大小写、全半角、撇号和连字符归一化后必须包含该单词，否则返回 `WORD_NOT_IN_CONTEXT`。
- 请求体上限 8KB。
- `provider`：`DOUBAO | QWEN | DEEPSEEK`；`credentialMode`：`PLATFORM | PERSONAL`。
- 平台模式只支持豆包；千问和 DeepSeek 必须登录并使用当前账号个人凭据。

## 响应合同

成功：

```json
{
  "ok": true,
  "data": {
    "word": "advocate",
    "phonetic": { "uk": "/ˈædvəkət/", "us": "/ˈædvəkət/" },
    "partOfSpeech": "noun",
    "contextMeaning": "a person who publicly supports a cause",
    "morphology": [
      { "type": "prefix", "part": "ad-", "meaning": "toward" },
      { "type": "root", "part": "voc", "meaning": "voice; call" }
    ],
    "mnemonic": "ad- (toward) + voc (voice) = someone who gives voice to a cause.",
    "examples": [
      "She is a strong advocate for ordinary families.",
      "He advocates keeping the library open longer."
    ]
  },
  "model": "实际模型",
  "provider": "DOUBAO",
  "credentialMode": "PLATFORM"
}
```

- `phonetic.uk` 和 `phonetic.us` 必须非空；模型可省略首尾斜杠，服务端统一补齐。
- `partOfSpeech` 最长 40 字符；`contextMeaning` 最长 400 字符。
- `morphology` 允许空数组，最多 6 项；`type` 只允许 `prefix`、`root`、`suffix`；每项 `part` 最长 80 字符，`meaning` 最长 160 字符。
- `mnemonic` 最长 500 字符。
- `examples` 必须为 1 至 3 条字符串，每条最长 300 字符。
- 模型返回 Markdown、额外字段、非法 JSON、空字段、音标或词性缺失、返回单词与请求不匹配时，整次查询判定 `invalid_response`，不返回半成品。

## 模型提示与校验

- 系统提示要求模型扮演面向英语学习者的词典编辑，只输出一个 JSON 对象。
- 释义必须解释单词在给定 `context` 中的具体用法；例句不使用页面中的人名、账号、订单号或其他敏感信息。
- 服务端拒绝顶层额外字段和嵌套额外字段。
- `word` 归一化后必须与请求一致；`data.word` 回填请求中的原词。
- 不把输入正文拼进错误日志，只记录分类、状态码和服务商。

## 鉴权、失败与额度

- 沿用 `BOOKKEEPING_API_TOKEN` 与 `X-Bookkeeping-Token` 校验；生产环境缺少服务 token 时 503。
- 个人豆包凭据沿用 `resolveForUser`；失败或额度耗尽时记录凭据失败状态，成功后记录成功。
- 千问和 DeepSeek 沿用现有个人凭据解密服务。
- 主要错误码：`INVALID_REQUEST`、`WORD_NOT_IN_CONTEXT`、`AUTHENTICATION_REQUIRED`、`PERSONAL_API_REQUIRED`、`PERSONAL_AUTH_INVALID`、`PERSONAL_QUOTA_EXHAUSTED`、`WORD_LOOKUP_PROVIDER_UNAVAILABLE`、`WORD_LOOKUP_RATE_LIMIT`、`WORD_LOOKUP_TIMEOUT`、`WORD_LOOKUP_INVALID_RESPONSE`。
- 状态码：字段/单词/上下文错误 400，请求体过大 413，登录失效 401，凭据缺失 409，额度耗尽 403，限流 429，超时 504，服务商/格式/未知错误 502 或 503。

## 验收

- 定向 Vitest：请求白名单、英文 token、上下文包含、长度和 8KB 上限、严格 JSON、音标补齐、单词匹配、示例数量、个人/平台路由和错误映射。
- 修改文件 ESLint 通过，生产构建包含 `/api/bookkeeping/word-lookup`。
- 部署后公网冒烟：无 token 401、额外字段 400、单词不在上下文 400、合成英文真实豆包调用 200。
- 不发送真实 OCR 正文、真实账本或真实用户数据。

## 未验证

- 真实页面 OCR 错词、专有名词和复杂缩写的词卡准确率。
- 真机网络波动、额度耗尽、大字体、深色模式和 TalkBack 表现。

## 2026-11-10 本地实现与验证

- 新增 `POST /api/bookkeeping/word-lookup` 与独立 `word-lookup` 客户端；字段白名单、英文 token、上下文包含、8KB/1,000 字符限制、严格 JSON、IPA 补齐、词性/释义/词根/助记/例句校验均已实现。
- 674 项干净 Vitest（排除旧 `.worktrees` 和 PostgreSQL 集成测试）通过；新增路由和客户端 12 项定向测试通过；修改文件 ESLint 通过。
- `npm run build` 通过，Build ID `9YS9_XJBFS2pdFLpovlt_`，产物包含 `/api/bookkeeping/word-lookup`。
- 使用合成句 `In the video, a peaceful advocate is interviewed at a rally.` 真实调用豆包平台额度成功，模型 `doubao-seed-2-0-mini-260428` 返回完整英文词卡；未发送真实 OCR 正文、账本或用户数据。
- 本地实现完成时尚未部署；随后已完成公网部署、鉴权/边界冒烟和真实豆包合成句验证，真实页面端到端仍未验证。

## 2026-11-10 上线发布

- 用户回复“上线”，授权部署 `POST /api/bookkeeping/word-lookup`。本次不修改数据库 schema、密钥、账号数据或用户正文。
- 发布包 `next-build-word-lookup-20261110.tar.gz` 为 1,580,004 字节，SHA-256 `05646F5294D3557471FE7C54E3AF1FC790003FB249E4C1FB8A2BA6F3B10A3ECF`；上传后服务器校验一致，Build ID `9YS9_XJBFS2pdFLpovlt_`。
- staging 独立端口 3109：登录页 200、GET 405、无 token POST 401、额外 `image` 字段 400、单词不在上下文 400、真实豆包合成句词卡 200。模型 `doubao-seed-2-0-mini-260428` 返回完整 UK/US 音标、词性、语境释义、词根词缀、助记和 2 条例句。
- 生产切换后公网 `https://homestorag.xyz` 复测同一组结果全部通过；`home-inventory-app` 为 active，最近 10 分钟错误级日志 0 条。
- 回滚材料：备份目录 `/opt/home-inventory-backups/bookkeeping-word-lookup-20261110/`；应用 archive SHA-256 `461ebfef380c211118e007dfdd708462e96e253bebee42a042935bfe1ba22f98`；数据库 dump SHA-256 `f61ce2afa1cecf04ee785dad8f97bf631e399435a1f6ac122aa5c70af0210afd`，`pg_restore --list` 可读 203 项。上一版生产构建保留为 `/opt/home-inventory-app/.next.previous-word-lookup-20261110`，Build ID `K4ASw_fH2tFDVDeXNkFpE`。
- Android `0.1.85/code 85` 已发布到 `https://homestorag.xyz/apk/smart-bookkeeper-latest.apk`，156,651,807 字节，SHA-256 `B80951E08C2D4B02E9774E12331B5B47AD924762B5B63B0F017CB32363F72911`；公网完整重下载的 HTTP 200、MIME、大小和 SHA-256 均与本地一致。旧 `0.1.84` 已备份。公网包在模拟器覆盖安装冷启动成功。
- 未验证：真实页面 OCR 错词、专有名词和复杂缩写准确率，真机网络波动、额度耗尽、大字体、深色模式、横屏和 TalkBack 表现。

## 2026-11-10 词卡内嵌套点词扩展

- Android 词卡中的助记和例句继续复用同一接口：点击其中英文 token 时，将该 token 作为 `word`、所在助记/例句作为 `context` 发起查询。
- 服务端合同、字段白名单、英文 token、上下文包含、长度限制、鉴权和隐私边界均不改变；服务端不需要新增接口或数据库字段。
- Android 使用本地返回栈展示嵌套词卡，不设层级上限；返回、重试、重新翻译和关闭气泡的生命周期由 Android 会话控制。

### 实现与验证证据

- Android 已实现助记/例句英文 token 点击、返回栈、返回上一父层和保留父层的重试；词卡仍显示在最初原文句下方。
- 881 项 JVM、Lint、Debug APK 构建通过；模拟器翻译气泡 11 项仪器测试通过，包含助记/例句点词与嵌套返回。
- 服务端代码、接口、数据库和部署均未变更。Android `0.1.86/code 86` 已发布：APK 156,211,910 字节，SHA-256 `1BCCB933BF9BE04B7DC4734EA3B665F8A9DF34D9FE6E7CEE0744040A69083123`；公网完整重下载一致，模拟器覆盖安装冷启动成功。旧 `0.1.85` 已备份到 `/opt/home-inventory-backups/bookkeeper-86-20261110/`。真机手感、真实模型例句质量和 TalkBack 未验证。
