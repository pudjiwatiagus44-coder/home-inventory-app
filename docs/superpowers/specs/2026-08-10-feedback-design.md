# 意见反馈设计（2026-08-10）

## 背景

用户希望 Web 和 Android 的帮助入口都能提交意见反馈，反馈内容直接发送到固定 QQ 邮箱 `736259416@qq.com`。

## 范围

- Web：顶部栏新增“帮助”入口，帮助弹窗内包含简明使用说明和反馈表单。
- Android：现有“帮助”弹窗内新增反馈表单。
- 服务端：新增登录态反馈接口，复用现有 QQ SMTP 发送邮件。

不做：

- 不保存反馈到数据库或日志。
- 不要求用户填写联系方式，自动附带登录账号。
- 不做反馈历史、回复通知、图片附件。

## 接口

### POST /api/feedback

请求：

```json
{
  "message": "反馈内容",
  "source": "web" | "android",
  "appVersion": "0.5.23"
}
```

`message` 必填，去首尾空白后 1-2000 字符；`source` 可选，默认 `web`；`appVersion` 可选。

响应：

- `200` `{ ok: true }`
- `400` 空消息或超过 2000 字符
- `401` 未登录
- `429` 同一账号 1 小时内超过 3 条
- `501` SMTP 未配置
- `500` 邮件发送失败

## 服务端设计

新增文件：

- `src/server/feedback/feedback-service.ts`
- `src/server/feedback/feedback-rate-limiter.ts`
- `src/app/api/feedback/route.ts`
- `src/app/api/feedback/handlers.ts`

`feedback-service` 接收当前用户、来源、版本和反馈内容，调用 SMTP 发送邮件；目标邮箱固定为 `736259416@qq.com`，可通过 `FEEDBACK_TO_EMAIL` 环境变量覆盖，默认使用固定地址。

邮件标题：

```text
家庭物品 App 反馈 - <登录邮箱>
```

邮件正文包含：

- 反馈内容
- 登录邮箱
- 来源（Web/Android）
- App 版本
- 反馈时间（服务器 UTC 时间）

复用 `src/server/mail/smtp-mailer.ts` 的 SMTP 配置和 transporter，扩展 `sendFeedbackEmail` 方法。

`feedback-rate-limiter` 使用内存 Map，键为 `userId`，窗口 1 小时，最大 3 条，行为与现有 `forgot-password-rate-limiter` 一致。

## Android 设计

- `HomeInventoryApi` 增加 `POST api/feedback`。
- 新增 `FeedbackRequest` DTO：`message`、`source`、`appVersion`。
- 新增 `FeedbackRepository`，封装提交反馈。
- `HelpDialog` 增加反馈输入区和提交按钮，提交成功后提示“反馈已发送”。
- `DashboardHost` 通过 `AppRoot` 注入 `FeedbackRepository`，并把 `BuildConfig.VERSION_NAME` 传给提交逻辑。

### Android 顶部栏调整（2026-08-11 补充）

- 右上角新增一个“切换家庭”按钮，点击后打开家庭切换弹窗；弹窗列出用户加入的全部家庭（包括共享家庭和自己创建的其他家庭），选择后立即切换；顶部继续显示当前家庭名称。
- 右上角新增“设置”按钮：把“备份、导入、邀请、退出”收进设置菜单。
- “草稿箱”和“帮助”保持为顶部栏独立按钮。
- 切换家庭时仍走 `refreshSnapshot(householdId)`，服务端校验 membership；切换后清单立即刷新。

## Web 设计

- 顶部栏新增“帮助”按钮，打开帮助弹窗。
- 帮助弹窗包含简短使用说明和反馈表单。
- 新增 `src/features/feedback/feedback-client.ts` 调用 `POST /api/feedback`。
- 新增 `src/features/feedback/FeedbackDialog.tsx`，提交成功后提示“反馈已发送”。

## 错误与安全

- 必须登录后才能提交，服务端从 session 获取用户邮箱，不接受客户端伪造收件人。
- 消息只作为纯文本/转义后的 HTML 发送，不执行任何富文本。
- 限频在服务端执行，客户端隐藏按钮不作为安全边界。
- SMTP 凭据仍只存服务器 `app.env`，不进入仓库和客户端。

## 测试

- 服务端：成功发送、未登录、空消息、超长消息、限频、SMTP 未配置、发送失败。
- Android：DTO/Repository 提交成功与失败、HelpDialog 反馈状态。
- Web：feedback-client 请求体、FeedbackDialog 反馈状态。
- 验证命令：Android `testDebugUnitTest` / `assembleDebug`；Web `vitest`、`npx eslint src`、`npm run build`。

## 验收

- Web 帮助弹窗提交反馈后，服务端返回成功并收到 QQ 邮件。
- Android 帮助弹窗提交反馈后，服务端返回成功并收到 QQ 邮件。
- Android 右上角箭头按钮可在共享家庭之间切换，切换后能显示房主家庭的区域/位置/物品。
- Android 设置菜单包含备份、导入、邀请、退出；草稿箱和帮助仍在顶部栏。
- 未登录调用接口返回 401。
- 空内容返回 400，超限返回 429。
