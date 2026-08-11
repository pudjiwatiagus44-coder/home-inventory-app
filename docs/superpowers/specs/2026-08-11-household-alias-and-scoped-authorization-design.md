# 家庭空间个人别名与按地点授权设计（2026-08-11）

## 背景

用户确认当前只使用阿里云自托管版本（`homestorag.xyz` + 自有 PostgreSQL + Next.js API/service/repository + Android 客户端），Supabase 已归档为历史参考，不再作为实现、测试、调试或部署定位目标。

Android 顶部家庭下拉已经支持切换已加入家庭、创建新“地点”（本设计内“地点”指家庭/家庭空间，不指库存里的格子位置）、以及 owner 重命名真实家庭名。用户进一步确认：

- 授权用户也可以“重命名地点名”，但这个名称只对自己可见。
- 邀请/授权时可以选择授权哪些地点，默认只授权当前选择的地点，也可以一次选择多个地点。
- 邀请页面可以设置每个地点的权限，也可以删除某个地点授权。
- 新增一种“只能新增不能删除”的授权档位：可新增，可编辑自己新增的内容，不可删除，也不可编辑别人已有内容。

## 术语

- 家庭空间 / 地点：同一个概念，数据库仍以 `households` 表承载。UI 可以显示“地点”，代码和 API 继续优先使用 `household` 命名。
- 真实家庭名：`households.name`，属于家庭空间本身。只有 owner 可以修改，所有未设置个人别名的成员都看到它。
- 个人别名：某个用户对某个家庭空间设置的显示名，只影响该用户自己的列表、顶部栏和邀请管理视图，不改变 `households.name`。
- 库存位置：`locations` 表中的格子/位置，不属于本设计里“地点名”的含义，除非在“新增权限”规则中明确提到可新增位置。

## 权限模型

`household_members.role` 扩展为：

- `owner`：房主。拥有全部库存权限、真实家庭名管理、成员/邀请/授权管理权限。不能通过普通授权页面转让 owner。
- `member`：管理成员。UI 显示为“管理”。拥有全部库存新增/编辑/删除权限，并可以在其有管理权的家庭空间内生成邀请、设置授权和移除授权。
- `contributor`：新增成员。可以读取该家庭空间数据；可以新增物品和库存位置；可以编辑自己创建的物品和库存位置；不能删除任何内容；不能编辑别人创建或历史归属不明的内容；不能管理邀请和成员授权。
- `readonly`：只读成员。只能查看该家庭空间内的数据和照片，不能新增、编辑、删除，也不能管理邀请和成员授权。

现有 `member` 语义保持为完整库存权限，新增 UI 文案“管理”，以减少迁移风险。现有 `readonly` 继续保持只读。新增 `contributor` 后，所有写接口必须在服务端按角色校验，前端隐藏按钮只作为体验优化。

## 数据模型

### household_user_preferences

新增表，用于保存个人别名：

```sql
household_user_preferences
  user_id uuid references users(id)
  household_id uuid references households(id)
  display_name text null
  created_at timestamptz
  updated_at timestamptz
  primary key (user_id, household_id)
```

规则：

- 当前用户只能读取和写入自己的 preference。
- 服务端写入前必须校验当前用户是该 household 的成员。
- `display_name` 去首尾空白后 1-50 字符；空字符串表示清除个人别名。
- `GET /api/family/households` 返回 `name`、`displayName`、`effectiveName`。客户端默认显示 `effectiveName = displayName || name`。

### creator 字段

`items.created_by` 已存在，用于限制 `contributor` 只能编辑自己创建的物品。

`locations` 需要补充 `created_by`，用于限制 `contributor` 只能编辑自己创建的位置。历史位置可回填为空或 owner，实施时以迁移安全为准；`contributor` 不应获得编辑历史/未知创建者位置的权限。区域 `areas` 暂不纳入 contributor 可新增范围，保持 `owner/member` 管理，避免一次性扩大结构权限。

## 邀请与授权

当前单家庭邀请需要升级为“邀请包 + 授权明细”：

```text
household_invitations
  id
  token
  created_by
  created_at
  updated_at
  expires_at
  revoked_at

household_invitation_grants
  invitation_id
  household_id
  role: owner 不可选；member / contributor / readonly 可选
```

兼容策略：

- 现有只传 `householdId` 的创建邀请接口等价为创建一个 grants 明细，默认 role 为 `member`（管理），或由 UI 显式传入当前选择的权限。
- 新 UI 创建邀请时，默认勾选当前选中的 household；用户可以多选自己有管理权的 household，并为每个 household 选择 `member` / `contributor` / `readonly`。
- 被邀请用户打开链接并申请加入后，审批通过时按 grants 一次性创建多个 `household_members` 记录。
- 管理页面可以针对某个用户在某个 household 的授权单独修改 role 或删除该 household 授权。删除授权只移除访问权，不删除家庭数据。

## API 设计

- `GET /api/family/households`
  - 返回当前用户可访问的全部家庭空间。
  - 每项包含 `id`、`name`、`displayName`、`effectiveName`、`role`。

- `PATCH /api/family/households/display-name`
  - 请求：`{ householdId, displayName }`
  - 当前登录用户为该 household 成员即可调用。
  - 写入/清除个人别名，不修改 `households.name`。

- `PATCH /api/family/households`
  - 继续用于 owner 修改真实家庭名。
  - 非 owner 仍返回 403。

- `POST /api/family/invitations`
  - 请求：`{ grants: [{ householdId, role }] }`
  - `grants` 缺省时兼容旧参数 `{ householdId }`。
  - 调用者必须对每个 household 拥有 `owner` 或 `member` 管理权限。

- 成员授权管理接口
  - 可沿用现有 member list/update/remove API，但请求必须显式携带 `householdId`。
  - 修改 role 时仅允许 `member` / `contributor` / `readonly`。
  - 删除授权只删除该 household 的 membership，不删除用户账号、不删除家庭数据。

## Android 设计

- 顶部栏和下拉框显示 `effectiveName`。
- 顶部家庭名长按和下拉项长按都打开“我的显示名”弹窗；任何已加入该家庭空间的用户都能保存个人别名。
- owner 修改真实家庭名作为后续独立入口处理，避免和“只有自己可见”的个人别名混淆。
- 下拉框底部继续保留“添加新地点”，创建的是新的 household；新建后 owner 自动是当前用户，且该用户可以继续设置自己的个人别名。
- 邀请页面默认勾选当前 household；支持多选 household；每个 household 一行权限选择。
- 成员/邀请管理页面显示成员在每个 household 下的权限，支持修改权限或删除该 household 授权。

## Web 设计

- Web/PWA 的家庭选择器、邀请页面和成员管理页面与 Android 共享同一套服务端 API 和权限语义。
- Web 显示家庭名时同样使用 `effectiveName`。
- 个人别名设置只影响当前登录用户自己的 Web 和 Android 视图。

## 安全边界

- 所有权限判断必须在服务端执行。
- 客户端传入 `householdId` 只能作为选择目标，服务端必须校验 membership 和 role。
- `contributor` 的新增/编辑限制必须在 service/repository 写入前兜底；不能依赖 UI 禁用按钮。
- `displayName` 只允许当前用户写自己的记录，不能通过 API 替别人设置别名。
- 邀请 grants 中不能包含调用者无管理权的 household，也不能授权 `owner`。

## 验收标准

- 用户 A 和用户 B 加入同一个 household 后，A 设置个人别名为“我的家”，B 设置为“爸妈家”；两人再次打开 App/Web 时分别看到自己的名称，数据库 `households.name` 不变。
- 授权用户长按下拉栏家庭名可修改个人别名；非 owner 调用真实家庭名重命名接口仍返回 403。
- 创建邀请时默认只选当前 household；选择多个 household 后，审批通过会为申请人创建对应多个 membership，并按每个 grant 写入不同 role。
- `member` 可以新增/编辑/删除家庭空间内库存数据，并能管理该 household 的邀请和成员授权。
- `contributor` 可以新增物品和位置；可以编辑自己创建的物品和位置；删除物品/位置返回 403；编辑他人创建的物品/位置返回 403。
- `readonly` 新增/编辑/删除均返回 403。
- 删除某个 household 授权后，该用户下一次请求该 household 数据返回 403，但其他 household 授权不受影响。

## 非目标

- 不重新启用 Supabase、RLS、Supabase Auth 或 Supabase SDK。
- 不做 owner 转让。
- 不做成员自助退出。
- 不把“个人别名”同步给其他成员。
- 不把 `contributor` 扩大到区域 `areas` 管理，除非后续用户明确确认。
