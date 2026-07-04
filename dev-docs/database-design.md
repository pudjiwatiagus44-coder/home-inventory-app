# Database Design

## 目标

为 Home Inventory App 第一版设计 Supabase Postgres schema 和 Row Level Security 边界。

第一版目标是：用户注册登录后，只能管理自己家庭空间里的区域、位置和物品。虽然第一版不开放家庭成员共享，但保留 `households` 和 `household_members`，为后续共享功能留出清晰扩展点。

## 业务对象

| 对象 | 业务含义 | 第一版是否需要 | 说明 |
| --- | --- | --- | --- |
| `auth.users` | Supabase 认证用户 | 是 | 由 Supabase Auth 拥有 |
| `profiles` | 用户公开/展示资料 | 是 | 存 display name，不能存密码 |
| `households` | 一个家庭空间 | 是 | 第一版每个用户默认一个家庭 |
| `household_members` | 用户和家庭的成员关系 | 是 | 第一版仅 `owner`，后续可扩展 member |
| `areas` | 区域，如 A 区、厨房、化妆桌 | 是 | 属于一个 household |
| `locations` | 具体位置，如 A1、上橱柜 | 是 | 属于一个 household，可归属 area |
| `items` | 物品 | 是 | 属于 household，可放在 location |
| `audit_logs` | 操作审计 | 否 | MVP 暂不做，后续公开用户阶段再评估 |
| `attachments` | 图片/附件 | 否 | 第一版不上传照片 |
| `subscriptions` | 会员/付费权益 | 否 | 第一版不做支付 |

## 关系设计

| 关系 | 类型 | 外键位置 | 原因 |
| --- | --- | --- | --- |
| `auth.users` -> `profiles` | 1:1 | `profiles.id` | 每个登录用户一份 profile |
| `auth.users` -> `household_members` | 1:N | `household_members.user_id` | 用户未来可加入多个家庭 |
| `households` -> `household_members` | 1:N | `household_members.household_id` | 家庭可以有多个成员 |
| `households` -> `areas` | 1:N | `areas.household_id` | 区域属于家庭 |
| `households` -> `locations` | 1:N | `locations.household_id` | 位置属于家庭 |
| `areas` -> `locations` | 1:N | `locations.area_id` | 位置可归入区域 |
| `households` -> `items` | 1:N | `items.household_id` | 物品属于家庭 |
| `locations` -> `items` | 1:N | `items.location_id` | 多个物品可放同一位置 |

## 命名和字段规则

- 表名使用英文 snake_case 复数名。
- 主键使用 `id uuid primary key default gen_random_uuid()`。
- 所有用户数据表使用 `created_at` 和 `updated_at`。
- MVP 不做软删除；删除是真删除。后续如果需要回收站，再加 `deleted_at`。
- 密码完全交给 Supabase Auth，不在业务表存密码或密码 hash。
- 日期字段 `expire_date` 使用 `date`，空值表示无过期日。
- 用户输入文本字段必须限制长度，前端体验校验不能替代数据库约束。

## Schema 草案

### profiles

```sql
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint profiles_display_name_length check (char_length(display_name) <= 80)
);
```

### households

```sql
create table public.households (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  name text not null default '我的家',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint households_name_length check (char_length(name) between 1 and 80)
);
```

### household_members

```sql
create table public.household_members (
  household_id uuid not null references public.households(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'owner',
  created_at timestamptz not null default now(),
  primary key (household_id, user_id),
  constraint household_members_role_check check (role in ('owner', 'member'))
);
```

MVP 只创建 `owner`。`member` 是后续家庭共享预留值，不在第一版 UI 暴露。

### areas

```sql
create table public.areas (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  name text not null,
  color text not null default '#64748b',
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint areas_name_length check (char_length(name) between 1 and 80),
  constraint areas_color_format check (color ~ '^#[0-9A-Fa-f]{6}$'),
  constraint areas_id_household_unique unique (id, household_id),
  constraint areas_unique_name_per_household unique (household_id, name)
);
```

### locations

```sql
create table public.locations (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  area_id uuid,
  name text not null,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint locations_name_length check (char_length(name) between 1 and 80),
  constraint locations_id_household_unique unique (id, household_id),
  constraint locations_unique_name_per_household unique (household_id, name),
  constraint locations_area_same_household_fk
    foreign key (area_id, household_id)
    references public.areas(id, household_id)
    on delete set null (area_id)
);
```

注意：`locations.area_id` 必须和 `locations.household_id` 属于同一个 household。初始 migration 使用 `(area_id, household_id)` 复合外键约束处理。

### items

```sql
create table public.items (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  location_id uuid,
  name text not null,
  note text not null default '',
  expire_date date,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint items_name_length check (char_length(name) between 1 and 120),
  constraint items_note_length check (char_length(note) <= 1000),
  constraint items_location_same_household_fk
    foreign key (location_id, household_id)
    references public.locations(id, household_id)
    on delete set null (location_id)
);
```

注意：`items.location_id` 必须和 `items.household_id` 属于同一个 household。初始 migration 使用 `(location_id, household_id)` 复合外键约束处理。

## 索引

```sql
create index households_owner_user_id_idx on public.households(owner_user_id);
create index household_members_user_id_idx on public.household_members(user_id);
create index areas_household_id_sort_idx on public.areas(household_id, sort_order, created_at);
create index locations_household_id_sort_idx on public.locations(household_id, sort_order, created_at);
create index items_household_id_created_at_idx on public.items(household_id, created_at desc);
create index items_location_id_idx on public.items(location_id);
create index items_expire_date_idx on public.items(expire_date) where expire_date is not null;
```

搜索 MVP 可以先用 `ilike` 查询 `items.name` 和 `items.note`。如果后续数据量变大，再加全文搜索索引。

## RLS 基础函数

为避免每条策略重复写复杂子查询，建议建立 helper function：

```sql
create or replace function public.is_household_member(target_household_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1
    from public.household_members hm
    where hm.household_id = target_household_id
      and hm.user_id = auth.uid()
  );
$$;
```

实现时必须确认该函数不会绕过预期权限，只返回当前登录用户是否是指定 household 成员。

## RLS 策略设计

所有 public 用户数据表必须：

```sql
alter table public.profiles enable row level security;
alter table public.households enable row level security;
alter table public.household_members enable row level security;
alter table public.areas enable row level security;
alter table public.locations enable row level security;
alter table public.items enable row level security;
```

### profiles

规则：

- 用户只能读自己的 profile。
- 用户只能更新自己的 profile。
- 用户只能插入自己的 profile。

策略草案：

```sql
create policy "profiles_select_own"
on public.profiles for select
using (id = auth.uid());

create policy "profiles_insert_own"
on public.profiles for insert
with check (id = auth.uid());

create policy "profiles_update_own"
on public.profiles for update
using (id = auth.uid())
with check (id = auth.uid());
```

### households

规则：

- 用户只能读取自己是成员的 household。
- 用户不能通过普通前端直接创建 household；默认 household 由受控初始化函数创建。
- 第一版只允许 owner 更新/删除自己的 household。

策略草案：

```sql
create policy "households_select_member"
on public.households for select
using (public.is_household_member(id));

create policy "households_update_owner"
on public.households for update
using (owner_user_id = auth.uid())
with check (owner_user_id = auth.uid());

create policy "households_delete_owner"
on public.households for delete
using (owner_user_id = auth.uid());
```

### household_members

规则：

- 用户只能看到自己所属 household 的成员记录。
- 第一版不开放普通前端插入/更新/删除成员关系；默认 owner 关系由注册初始化流程创建。
- 后续家庭共享上线前，必须重新设计 invite 和 member 权限。

策略草案：

```sql
create policy "household_members_select_member"
on public.household_members for select
using (public.is_household_member(household_id));
```

插入 owner 成员关系不建议由普通页面随手执行。第一版可以通过安全的初始化函数完成：创建 household 后，同时创建 owner membership。

### areas

规则：

- 用户只能读写自己 household 的 areas。

策略草案：

```sql
create policy "areas_select_member"
on public.areas for select
using (public.is_household_member(household_id));

create policy "areas_insert_member"
on public.areas for insert
with check (public.is_household_member(household_id));

create policy "areas_update_member"
on public.areas for update
using (public.is_household_member(household_id))
with check (public.is_household_member(household_id));

create policy "areas_delete_member"
on public.areas for delete
using (public.is_household_member(household_id));
```

第一版只有 owner，所以 member 与 owner 等价。未来开放共享后再区分成员权限。

### locations

规则：

- 用户只能读写自己 household 的 locations。
- `area_id` 如果存在，必须属于同一个 household。

策略草案：

```sql
create policy "locations_select_member"
on public.locations for select
using (public.is_household_member(household_id));

create policy "locations_insert_member"
on public.locations for insert
with check (public.is_household_member(household_id));

create policy "locations_update_member"
on public.locations for update
using (public.is_household_member(household_id))
with check (public.is_household_member(household_id));

create policy "locations_delete_member"
on public.locations for delete
using (public.is_household_member(household_id));
```

### items

规则：

- 用户只能读写自己 household 的 items。
- `location_id` 如果存在，必须属于同一个 household。
- `created_by` 应该等于当前用户；初始 migration 用 trigger 在前端未传时自动设置为 `auth.uid()`。

策略草案：

```sql
create policy "items_select_member"
on public.items for select
using (public.is_household_member(household_id));

create policy "items_insert_member"
on public.items for insert
with check (
  public.is_household_member(household_id)
  and (created_by is null or created_by = auth.uid())
);

create policy "items_update_member"
on public.items for update
using (public.is_household_member(household_id))
with check (public.is_household_member(household_id));

create policy "items_delete_member"
on public.items for delete
using (public.is_household_member(household_id));
```

## 初始化流程

新用户首次进入应用时需要一个默认 household。

推荐流程：

```text
用户注册/首次登录
  -> 创建 profiles 行
  -> 创建 households 行，owner_user_id = auth.uid()
  -> 创建 household_members 行，role = owner
  -> 创建默认 areas/locations，可选
```

实现方式：初始 migration 提供 `public.create_default_household(display_name text default '')`，由登录后的 Next.js 流程调用。这个函数会创建 profile、默认 household、owner membership 和默认区域；如果用户已经有 owner household，会返回已有 household。

### 初始化修复 migration

`supabase/migrations/202607030001_repair_default_household_rls.sql` 用于修复真实 Supabase 项目里可能出现的初始化漂移：

- 用户已有 `households` 但缺少 `household_members` owner 关系时，补回 owner membership。
- 用户已有 owner household 但缺少默认区域时，补回 `默认区域`。
- 重新定义 `public.is_household_member` 和 `public.create_default_household`，保持第一版权限模型不变。
- 重新落稳 `locations` 的 select/insert/update/delete RLS 策略。
- 重新落稳 `items_set_created_by` trigger 和 `items` 的 select/insert/update/delete RLS 策略。

这个 migration 不新增表、不新增角色、不改变第一版单账号私有清单边界。

`supabase/migrations/202607030002_reset_inventory_rls_policies.sql` 用于真实 Supabase 项目 RLS 策略疑似漂移时的二次修复：

- 删除 `areas`、`locations`、`items` 上现有 RLS policies。
- 按项目真源重新创建这三类库存表的 member-only select/insert/update/delete 策略。
- 重新创建 `items_set_created_by` trigger。
- 最后输出当前 policy 列表，供验收记录。

这个 migration 不改表结构，不扩大用户数据访问范围。

## 数据操作安全表

| 操作 | 登录要求 | 权限规则 | 校验位置 | 负例 |
| --- | --- | --- | --- | --- |
| 读取物品 | 必须登录 | household member only | RLS | 用户 B 查询用户 A household 无结果 |
| 新增物品 | 必须登录 | 只能写入自己的 household | RLS + DB constraint | 用户 B 指定用户 A household 插入失败 |
| 编辑物品 | 必须登录 | 只能改自己的 household item | RLS | 用户 B 修改用户 A item 失败 |
| 删除物品 | 必须登录 | 只能删自己的 household item | RLS | 用户 B 删除用户 A item 失败 |
| 新增位置 | 必须登录 | 只能写入自己的 household | RLS | 用户 B 指定用户 A household 插入失败 |
| 更新 profile | 必须登录 | 只能改自己的 profile | RLS | 用户 B 修改用户 A profile 失败 |

## 验收负例

第一阶段必须验证：

- 未登录用户读取 `items` 返回空或权限错误。
- 用户 A 新增 item 后，用户 B 无法 select 到该 item。
- 用户 B 用用户 A 的 `household_id` insert item 失败。
- 用户 B 用用户 A 的 `item_id` update/delete 失败。
- 用户 A 不能把 item 的 `household_id` 更新成不属于自己的 household。
- 如果 location 属于另一个 household，插入/更新 item 必须失败。

## 当前验证状态

- Supabase 项目已创建。
- 初始 migration 已由用户在 Supabase SQL Editor 执行成功。
- `202607030001_repair_default_household_rls.sql` 已作为 RLS 和默认 household 初始化修复方案加入仓库。
- `202607030002_reset_inventory_rls_policies.sql` 已作为真实 Supabase 项目 RLS 漂移的二次修复方案加入仓库；用户执行后二次反馈新增物品成功。
- 2026-07-04 用户 A/B 权限负例已在真实 Supabase 项目验证：A 可创建自己的 area/location/item；B 读取 A 的 household/area/location/item 均为 0 行；B 向 A household 插入 area/item 被 RLS 拒绝；B 更新/删除 A item 返回 0 行；未登录 anon 读取 A item 返回 0 行。结果记录见 `dev-docs/acceptance.md`。
- 当前证据支持第一版“用户只能访问自己 household 数据”的 RLS 边界。

## 仍需补充验证

- 在真实浏览器里完整走一遍区域、位置、物品新增/编辑/删除、搜索/筛选、刷新后仍存在的用户验收陪跑。
- 针对 `locations.area_id` 和 `items.location_id` 的跨 household 复合外键负例，后续如单独调整区域/位置关系或共享模型，需要再补更细的数据库负例。
- 如果未来开放家庭成员共享，必须重新设计 `household_members.role` 的 owner/member 写权限，不能沿用第一版 member-only 等价 owner 的简化策略。

## 下一步

1. 收口 `dev-docs/stages/mvp-first-loop.md` 和 `dev-docs/acceptance.md`，保持阶段计划、数据库设计和验收记录一致。
2. 重新运行 `npm test`、`npm run lint`、`npm run build`。
3. 做用户验收陪跑：真实浏览器验证区域/位置/物品 CRUD、搜索/筛选、移动端布局。
4. 阶段收口后创建 Git checkpoint。
