# 记账页面翻译接口真源

状态：2026-10-29 逐句翻译合同已部署到生产环境，Android 0.1.80 已发布。切句完全由模型完成，模型同时返回每句原文、译文与难词；服务端只校验原文覆盖完整性、字段和难词来源，再拼接兼容旧客户端的 `translatedText`。难词限制为每句最多 2 项、整段最多 8 项，只列真正影响理解的低频、专业或特殊语境词。公网鉴权、语言校验、12,000 字符与 64KB 请求体边界、真实豆包平台额度调用均已冒烟验证；Android 真机屏幕授权和真实页面翻译仍未验证。

## 目标与边界

悬浮猫“页面翻译”由 Android 端主动截图并在本机 OCR，只把 `OcrTextSanitizer` 处理后的纯文本发送到本接口。服务端只做文本翻译，不接收图片、截图、账本、设备标识或账号 ID，不保存原文、译文和翻译历史，不写数据库。

本接口是记账 App 的独立文本翻译资源，不复用记账结构化输出 schema，也不触发任何记账、同步或通知。

## 请求合同

`POST /api/bookkeeping/translate`

```json
{
  "text": "已脱敏的 OCR 文本",
  "sourceLanguage": "en",
  "targetLanguage": "zh-CN",
  "provider": "DOUBAO",
  "credentialMode": "PLATFORM"
}
```

- 字段白名单只允许 `text`、`sourceLanguage`、`targetLanguage`、`provider`、`credentialMode`；出现 `image`、`screenshot`、`accountId`、`deviceId` 等字段直接 400。
- `text` 去首尾空白后必须非空，上限 12,000 字符；请求体额外限制为 64KB。
- 原文语言：`auto`、`en`、`zh-CN`、`zh-TW`、`ja`、`ko`、`fr`、`de`、`es`、`ru`。
- 目标语言：上述语言去掉 `auto`；原文与目标相同且原文不是 `auto` 时返回 `SAME_LANGUAGE`，不调用模型。
- `provider`：`DOUBAO | QWEN | DEEPSEEK`。
- `credentialMode`：`PLATFORM | PERSONAL`。平台模式仅豆包可用；千问、DeepSeek 必须使用当前登录账号的个人凭据。

## 响应合同

成功：

```json
{
  "ok": true,
  "data": {
    "translatedText": "第一句译文\n第二句译文",
    "detectedSourceLanguage": "en",
    "segments": [
      {
        "originalText": "In the video, a peaceful advocate is interviewed at a rally.",
        "translatedText": "视频中，一位和平的倡导者正在集会上接受采访。",
        "vocabulary": [
          { "term": "advocate", "meaning": "倡导者" },
          { "term": "rally", "meaning": "集会" }
        ]
      }
    ]
  },
  "model": "实际模型",
  "provider": "DOUBAO",
  "credentialMode": "PLATFORM"
}
```

- `translatedText` 由服务端从 `segments[].translatedText` 按顺序拼接，保留给 0.1.77 等旧客户端；新客户端优先渲染 `segments`。
- `segments` 必须至少包含一句；切句由模型完成，`originalText` 必须按原文顺序覆盖全部输入。服务端忽略空白差异后校验所有 `originalText` 拼接必须还原输入，拒绝漏句、重复、乱序或改写。
- `vocabulary` 只列真正影响理解、低频、专业或有特殊语境的词或短语，不列常见基础词、功能词或可轻松直译的词，不允许凑数。每句最多 2 项、整段最多 8 项，超过即判定 `invalid_response`；`term` 必须出现在该句原文中（兼容大小写、全半角和常见连字符变体），`meaning` 使用目标语言解释。没有合适难词时返回空数组。
- `detectedSourceLanguage` 可选，仅在模型返回时出现。
- 服务端校验返回的服务商与请求一致；客户端也会复核。
- 模型返回 Markdown、额外说明字段、空文本或非法 JSON 都视为失败，不把原文冒充译文。

## 鉴权与额度

- 沿用 `BOOKKEEPING_API_TOKEN` 与 `X-Bookkeeping-Token` 校验。
- 个人额度沿用登录会话 Cookie，并按当前登录用户解析凭据；不接受客户端传入账号标识。
- 豆包平台额度使用服务端 `DOUBAO_API_KEY`。
- 豆包个人额度沿用现有加密凭据服务；鉴权失败或额度耗尽时记录服务商失败状态。
- 千问和 DeepSeek 沿用各自个人凭据解密服务。
- 翻译不自动重试，避免重复计费。

## 隐私与日志

- 不接收、不保存截图或图片。
- 不保存请求正文、原文或译文；无数据库写入。
- 日志不得记录 OCR 正文或译文；失败日志只允许错误分类、状态码和服务商。
- Android 翻译分支跳过现有 OCR 正文日志和 `ocr_diag.txt` 正文写入。

## 错误分类

主要错误码：`INVALID_REQUEST`、`TEXT_TOO_LONG`、`INVALID_LANGUAGE`、`SAME_LANGUAGE`、`AUTHENTICATION_REQUIRED`、`PERSONAL_API_REQUIRED`、`PERSONAL_AUTH_INVALID`、`PERSONAL_QUOTA_EXHAUSTED`、`TRANSLATION_PROVIDER_UNAVAILABLE`、`TRANSLATION_RATE_LIMIT`、`TRANSLATION_TIMEOUT`、`TRANSLATION_INVALID_RESPONSE`。

状态码约定：字段/语言错误 400，文本过长/请求体过大 413，未登录或个人凭据无效 401，个人凭据缺失 409，额度耗尽 403，限流 429，超时 504，其他上游错误 502/503。

## 涉及文件

- `src/app/api/bookkeeping/translate/route.ts`
- `src/app/api/bookkeeping/translate/handlers.ts`
- `src/app/api/bookkeeping/translate/route.test.ts`
- `src/server/recognition/translation.ts`
- `src/server/recognition/translation.test.ts`
- `src/app/api/bookkeeping/understand/handlers.ts`：`readBoundedJsonObject` 增加可选 body 上限参数，默认识别接口行为不变。

Android 客户端对应合同记录在记账仓库 `dev-docs/2026-10-29-page-translation-design.md`。

## 验证证据

- 2026-10-29 逐句翻译合同 16 项定向测试全部通过：AI 自行分句、原文完整覆盖、漏句/乱序拒绝、额外字段拒绝、难词必须来自原句、每句超过 2 项和整段超过 8 项拒绝、连字符和省略号变体匹配、同语言/非法目标/长度和 64KB 限制、平台与个人凭据路由、服务商失败映射。
- 本次 4 个修改文件的 ESLint 通过；全仓 ESLint 仍会被仓库内 `.worktrees` 的生成产物污染，不作为本次失败证据。
- `npx tsc --noEmit` 全仓仍有既有无关错误，但输出中未出现 `translate|translation` 相关错误。
- 2026-10-29 生产构建成功，Build ID `yv4K1_5tDw4oqpsonc515`，构建产物包含 `/api/bookkeeping/translate`。

## 2026-10-29 AI 分句生产部署证据

- 发布包 `next-build-ai-segments-v1.tar.gz` 1,561,186 字节，SHA-256 `6EADF02863BDFA7A0C7476A90A43AFBB13DAD6193385D6918CD5B8D99C1A3216`；上传后服务器 SHA-256 一致，Build ID `clz5Xe_ygwVrTUouxQmHX`。
- 使用独立 transient staging 服务在 3109 端口验证后切换；staging 与公网真实豆包平台额度调用均返回 HTTP 200，模型自行把示例拆成4句，响应包含每句 `originalText/translatedText` 以及 `advocate/policy/gathered` 等生词。
- 公网复测：登录页 200、翻译 GET 405、无 token POST 401、空 body 400、同语言 400；真实模型返回 `translatedText`、`segments`、`vocabulary` 和 `detectedSourceLanguage`。
- 生产服务 `home-inventory-app` 保持 active，WorkingDirectory `/opt/home-inventory-app`；`data`、`public`、`node_modules` 仍指向原绝对路径。
- 切换前完整保留上一版应用 `/opt/home-inventory-app-rollback-ai-segments-20261029`（Build ID `yv4K1_5tDw4oqpsonc515`），更早版本保留 `/opt/home-inventory-app-rollback-translate-segments-20261029`；staging 目录 `/opt/home-inventory-app-staging-ai-segments-20261029` 保留供排查。
- 本次未修改数据库 schema、密码、API Key 或 Android 账号数据；真实调用只使用合成英文句子，未发送真实 OCR 正文或账本数据。

## 2026-10-29 难词收敛部署证据

- 用户反馈模型把普通单词也列为生词，要求只列真正有难度的词。提示词改为“真正影响理解、低频、专业或有特殊语境”，明确排除常见基础词、功能词和可轻松直译的词，不允许凑数。
- 解析器限制收紧为每句最多 2 项、整段最多 8 项；超过即判定 `invalid_response`，不返回半成品。
- 定向 Vitest 16 项通过（新增每句 3 项拒绝、整段 10 项拒绝），修改文件 ESLint 和生产构建通过；Build ID `53I77QLGq79uia2s6u8KE`，发布包 `next-build-difficult-words-v1.tar.gz` 1,560,820 字节，SHA-256 `5FF7544FCCF647060600FEF7D0CA7836EA7967ED913F23F03CC4C4D1FB5299DD`。
- 3109 staging 与公网真实豆包调用均返回 HTTP 200；合成英文 3 句共返回 5 个难词（`pro-life advocate / rally / legislation / abortion access / segment`），每句最多 2 项，`peaceful` 等基础词不再列入。
- 切换前完整保留 `/opt/home-inventory-app-rollback-difficult-words-20261029`（Build ID `clz5Xe_ygwVrTUouxQmHX`）；staging 目录 `/opt/home-inventory-app-staging-difficult-words-20261029`。生产服务保持 active，未修改数据库、密钥或账号数据。

## 2026-10-29 生产部署证据

- 用户明确要求“先部署翻译接口”，授权本轮生产部署；未修改数据库 schema、密钥、Android APK 或无关业务。
- 本地生产构建 Build ID `pW2tFuHBk4i32dxu4ql1m`；发布包 SHA-256 `E97C29AAEB370574F3B454E4FABB8FB013F6D49C69E789824CAFD460B4BC294E`，上传后服务器 SHA-256 一致。
- 采用独立 staging 端口 3108 验证后切换：登录页 200、翻译 GET 405、无 token POST 401、带 token 空 body 400、同语言 400、既有千问凭据接口未登录 401。
- 公网切换后复测结果一致；70,000 字节请求体返回 413 `Request body is too large`，12,001 字符文本返回 413 `TEXT_TOO_LONG`，证明 Nginx 未在 64KB 前拦截，应用层双限制生效。
- 服务 `home-inventory-app` 为 `active`，WorkingDirectory `/opt/home-inventory-app`，最近 3 分钟错误级日志 0 条；`data`、`public`、`node_modules` 沿用原绝对链接。
- 应用备份 `/opt/home-inventory-backups/bookkeeping-translate-20261029/home-inventory-app.tar.gz`（6,685,122 字节，SHA-256 `69b92f26612a449d0631b404abaa8795647a63ae187d7ad7b3d62171c009e552`）；数据库备份 `home_inventory.dump`（336,050 字节，SHA-256 `18184a182cca22d3a45c337897bc08f60ee6fa1b62ef7ded671245959b852eb3`，`pg_restore --list` 可读 203 项）。回滚目录 `/opt/home-inventory-app-rollback-translate-20261029`。

## 后续验收

1. Android 真机验证系统屏幕授权、后台拉起猫咪旁对话框、逐句原文/译文/生词滚动、账本零写入、日志无正文、大字体/深色模式/TalkBack。
2. 继续验证自动检测、同文本多目标语言、超时、额度耗尽和个人凭据鉴权失败。
3. 未取得真机证据前，真实页面翻译闭环保持“未验证”，不能以合成文本 HTTP 冒烟替代。

## 2026-11-11 翻译结果格式异常修复

### 根因

- 用户英文邮件截图失败的直接原因：脱敏后文本被模型正常分成 11 段，原文覆盖率校验通过，但整页难词达到 9 至 10 个，超过 `MAX_VOCABULARY_TOTAL=8`，可选增强内容导致整页被判 `TRANSLATION_INVALID_RESPONSE`。
- 6 次真实模型复现：10、9、10 个难词失败；7、5 个难词成功；另一次 9 个难词失败。
- 约 10,920 字符长页另有独立根因：模型 `finish_reason=length`，输出 JSON 未闭合，客户端只看到“格式异常”。
- 服务器源码目录此前仍是旧版翻译实现，与线上 `.next` 构建不一致；本次已同步源码，后续以构建和实际接口为准。

### 修复边界

- 超过 6,000 字符才分块；按换行、句号、问号、逗号、空格优先切分，避免截断代理对；分块并行后按原顺序合并。
- 分段上限从 4,000 放宽到 8,000 字符；长页难词用 `capVocabulary` 截断到 8 个，不再整页失败。
- `parseVocabulary` 容错：每句最多 2 项，过滤空词、重复词、非原句子串和非法字段；单个难词不合法不影响译文。
- 原文覆盖校验保持严格，必须由全部 `originalText` 按顺序还原输入；没有放宽为局部匹配。
- 提示词要求 `[EMAIL]`、`[PHONE]`、`[LONG_ID]`、`[CARD_TAIL]` 占位符原样保留。
- 短文本继续使用 45 秒预算；分块长页使用 90 秒预算。
- Nginx 为 `location = /api/bookkeeping/translate` 单独设置 180 秒读写超时；Android 翻译客户端读超时改为 120 秒，其他接口仍为 60 秒。

### 验证与发布证据

- 翻译定向测试 18 项、干净单测 91 个文件 676 项通过；`npx eslint src` 为 0 error、7 条既有 warning；`npm run build` 成功。
- Build ID `2vuhrF4keXsR3jpq4ds1U`；发布包 1,576,520 字节，SHA-256 `2B2187510472ADCF694575356181D6DA1D69BBAAB8DF935C6DAA91049B81FD1E`，服务器校验一致。
- 修复后同一邮件结构连续 6 次真实调用全部成功，难词为 6 或 8 个；约 11,686 字符长页耗时 65,006 ms、2 次模型调用、106 段、8 个难词。
- 公网发布后使用 1,393 字符合成邮件连续冒烟 3 次：HTTP 200，耗时 25/19/26 秒，均为 10 段、8 个难词，占位符保留；无 token 401、GET 405、短文本 200。
- 旧构建保留在 `/opt/home-inventory-app/.next.previous-translation-format-20261111`（Build ID `9YS9_XJBFS2pdFLpovlt_`）；Nginx 原配置备份在 `/opt/home-inventory-backups/bookkeeping-translation-format-20261111/nginx-site.before`。
- 修改后的 `translation.ts`、`translation.test.ts` 和翻译路由 `handlers.ts` 已同步到服务器对应路径。

### 仍未验证

- 用户原始截图在真机上的端到端复测。
- 大字体、深色模式、TalkBack 下的长页翻译与气泡滚动。
- 同一句重复数十次的极端合成长页仍可能触发模型重复分段或截断，不作为真实页面验收样本。
