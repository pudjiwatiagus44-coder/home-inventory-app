# 记账成功卡刷新合同

2026-10-21 用户已在记账项目确认整笔/字段刷新、AI 金额排序候选、本地缓存及拒绝相同结果。批准设计真源：G:/AI项目集合/记账软件/dev-docs/2026-10-21-recognition-refresh-design.md。

实施仅新增记账 API 与模型返回可选 refreshHints，不修改家庭物品逻辑、登录/权限方案、生产数据库或部署。刷新 JSON /api/bookkeeping/refresh 复用现有认证、provider 与凭据选择；只返回当前交易结果，不在服务端新增账目。旧客户保持兼容，初始候选能力通过 X-Bookkeeping-Refresh: 1 请求。真实数据、生产请求、生产部署均不在本次本地开发授权内。

请求 current 字段为 amount/direction/category/merchant/description；scope 为 TRANSACTION/AMOUNT/MERCHANT/DESCRIPTION/CATEGORY；包括 requestId/ocrText/capturedAt/excludedValues/provider/credentialMode。响应 ok/status(CHANGED|NO_ALTERNATIVE)/provider/model/data(同current形状)/refreshHints.amountOptions(amount/rank/reason/evidenceLabel)。每笔最多5个候选，拒绝空、无依据和格式差异；无其他值返回 NO_ALTERNATIVE，不伪造替换。

## 本地实施与证据（2026-10-21）

- 新增 `/api/bookkeeping/refresh`，内部复用 understand 的 token/用户/provider/credentialMode 与个人凭据解析及错误映射。只返回单笔草稿；多个候选交易不合并入账，不触碰交易数据库。
- 字段刷新仅拷贝目标字段；整笔比较五项业务字段。Unicode NFKC、大小写、空白、标点及数值金额格式归一化后相同或已排除值返回 `NO_ALTERNATIVE`。金额无有效候选不更新；来源原始时间必填。
- 初次文字与图像接口仅在请求头 `X-Bookkeeping-Refresh: 1` 时请求并解析逐笔 `refreshHints`，旧版固定12字段合同保持严格。每笔金额候选正数、按数值去重、最多5个，需有主选金额和非空理由/标签；缺失时空列表，不伪造填补。整笔 `excludedValues` 使用 current 形状 JSON 字符串。
- TDD：新增合同测试先出现缺失模块的红灯；实现后定向8文件共99项通过，包括新路由5项、候选规范化与字段隔离3项、文字/图像响应协商3项和旧版88项兼容检查。命令：`node_modules/.bin/vitest.cmd run --exclude '**/.worktrees/**' src/server/recognition/bookkeeping-refresh src/server/recognition/doubao-bookkeeping.test.ts src/features/bookkeeping/bookkeeping-understanding-service.test.ts src/features/bookkeeping/bookkeeping-vision-rerecognition-service.test.ts src/app/api/bookkeeping/understand/route.test.ts src/app/api/bookkeeping/rerecognize/route.test.ts src/app/api/bookkeeping/refresh/route.test.ts`。
- 定向 ESLint 通过（0错误、0警告）。全库 `tsc --noEmit --incremental false` 未通过：已有 exports 发布源码快照引用缺失和既存测试类型错误；本次生产源码和新增测试未检出类型错误。未改动用户现有 `tsconfig.tsbuildinfo`。
- 未请求真实凭据/真实模型、未访问真实账目、未推送/部署。真实模型候选可信度、真实账号路由及手机到线上新接口闭环均未验证，生产环境尚无此新增接口。

### 2026-10-21 协议复核修正

- AMOUNT 只请求候选，返回 `NO_ALTERNATIVE` 和原 current，Android 自行从候选循环选取。候选按 AI 原 rank 排序，不把拟议新 amount 移到首位；校验的是输入当前原金额，缺失时丢弃候选。保留模型 rank 数值，最多5项后仍须包含当前金额。
- 刷新路由通过服务器内部 `skipCorrectionExamples` 禁止读取/发送历史纠错样本，普通 understand 原有行为不变。
- excludedValues 上限由30提高到1000，整体256KB请求界限仍有效；不得通过截断历史重新允许已展示结果。
- 新增5项回归先全部失败，修正后8文件104项通过，定向 ESLint 0错误0警告。覆盖旧金额不是首选、候选缺原金额、金额刷新原值保持、无历史反馈读取、32项排除仍拦截旧答案。
- 尚未生产部署或调用真实模型，归属校验与脱敏其它审查项由 Android 集成继续处理。

### 主代理交叉验证

2026-10-21 在当前提交 `5b17fd8` 上重新执行上述定向Vitest：8文件104项通过；本轮全部变更TS文件ESLint0错误0警告。`npm run build`生产构建成功，既有`tsconfig.build.json`生产类型检查通过，包含新`/api/bookkeeping/refresh`路由。未部署、未推送；用户原`tsconfig.tsbuildinfo`仍保持现有修改。

Android侧已处理来源、current和excluded文本脱敏，拒绝新脱敏占位内容保存；每卡独立门闩、原ID事务CAS与账号会话代号防晚写。当前仅合同和人工构造样本验证，真实模型对同图多订单/推荐价格的语义归属尚未验证，不能将提示词约束宣称为确定性归属校验。

### 2026-10-21 整笔刷新历史空字段兼容

- 整笔刷新仅强制 amount/direction/category 非空，允许历史未知 merchant/description 保持空字符串；业务变化与排除比较仍覆盖全部5字段。单字段商户/描述刷新仍拒绝空替代。
- 新增空商户/描述但金额18→20、整笔相同、整笔历史排除、空分类和单字段空值回归；空商户/描述用例先红后绿。8文件106项通过，定向 ESLint 0错误0警告。
- `npm run build` 通过：Next.js生产编译、`tsconfig.build.json`生产类型检查、35个静态页面生成与路由产物均成功，包含 `/api/bookkeeping/refresh`。未修改构建配置或用户原有 tsbuildinfo。
