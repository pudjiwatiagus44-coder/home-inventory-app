# Database Design

## 目标

为 Home Inventory App 第一版设计 Supabase Postgres schema 和 Row Level Security 边界。

第一版目标是：用户注册登录后管理自己家庭空间里的区域、位置和物品；2026-08-06 已确认将家庭成员共享纳入当前范围，`households` 和 `household_members` 直接承载共享，`household_invitations` 承载邀请链接，`household_join_requests` 承载加入申请。只有自己是成员的家庭数据可以读写，申请批准前不产生任何数据访问权。

## 业务对象

| 对象 | 业务含义 | 第一版是否需要 | 说明 |
| --- | --- | --- | --- |
| `auth.users` | Supabase 认证用户 | 是 | 由 Supabase Auth 拥有 |
| `profiles` | 用户公开/展示资料 | 是 | 存 display name，不能存密码 |
| `households` | 一个家庭空间 | 是 | 第一版每个用户默认一个家庭 |
| `household_members` | 用户和家庭的成员关系 | 是 | `owner` / `member` 已启用；member 与 owner 对库存数据权限相同，owner 额外管理家庭与成员 |
| `household_invitations` | 家庭邀请链接 | 是 | 2026-08-06 新增；token 随机不可猜，默认 30 天有效，可作废 |
| `household_join_requests` | 家庭成员加入申请 | 是 | 2026-08-06 新增；申请人提交申请，owner 批准后创建 member 关系 |
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
| `households` -> `household_invitations` | 1:N | `household_invitations.household_id` | 家庭可以有多个邀请链接（历史作废 + 当前有效） |
| `auth.users` -> `household_invitations` | 1:N | `household_invitations.created_by` | 邀请链接只能由 owner 创建 |
| `households` -> `household_join_requests` | 1:N | `household_join_requests.household_id` | 家庭可以有多个加入申请 |
| `auth.users` -> `household_join_requests` | 1:N | `household_join_requests.user_id` | 申请人提交申请；`decided_by` 为审批 owner |
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
- 邀请令牌使用随机不可猜、URL-safe 的 token（应用层生成），数据库只存 token 本身并建唯一约束。
- 数据属于 `household`：成员被移除后数据保留，访问由 RLS 基于 membership 立即失效。

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

`owner` 由注册初始化函数创建；`member` 只能通过批准申请的安全函数创建（见下方 `approve_household_join_request`）。不允许普通前端直接插入或修改成员关系，避免成员自提权或伪造 owner。

### household_invitations

```sql
create table public.household_invitations (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  token text not null,
  created_by uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  expires_at timestamptz not null,
  revoked_at timestamptz,
  constraint household_invitations_token_unique unique (token),
  constraint household_invitations_token_length check (char_length(token) between 20 and 200),
  constraint household_invitations_expires_after_created check (expires_at > created_at)
);
```

- 有效链接 = `revoked_at is null` 且 `expires_at > now()`；过期或作废后不可再提交申请。
- 同一家庭同一时间只允许一个有效链接：生成新链接前，先把该家庭现有未作废链接的 `revoked_at` 置为当前时间（应用层或函数内完成），并用部分唯一索引兜底。
- 链接不绑定成员：拿到链接的人都可以提交申请；链接通过微信等外部渠道手动发送。

### household_join_requests

```sql
create table public.household_join_requests (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  status text not null default 'pending',
  created_at timestamptz not null default now(),
  decided_at timestamptz,
  decided_by uuid references auth.users(id) on delete set null,
  constraint household_join_requests_status_check check (status in ('pending', 'approved', 'rejected'))
);
```

- 每个账号对同一家庭最多一条 `pending` 申请，用部分唯一索引保证（见索引节）。
- `approved` 时由安全函数创建 `member` 成员关系并写入 `decided_at` / `decided_by`；`rejected` 可重新申请。
- 申请人不能通过普通前端直接写入申请表，提交申请必须走安全函数（校验链接 token 有效）。

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
create index household_invitations_household_id_idx on public.household_invitations(household_id);
create unique index household_invitations_active_one_per_household_idx
  on public.household_invitations(household_id)
  where revoked_at is null;
create index household_invitations_token_idx on public.household_invitations(token);
create index household_join_requests_household_id_idx on public.household_join_requests(household_id);
create index household_join_requests_user_id_idx on public.household_join_requests(user_id);
create unique index household_join_requests_pending_unique_idx
  on public.household_join_requests(household_id, user_id)
  where status = 'pending';
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

家庭共享相关安全函数（security definer，内部校验后落库）。普通前端不能直接读写 `household_invitations` / `household_join_requests` 的敏感行，只能调用以下函数：

```sql
-- 1. 根据 token 查询有效邀请对应的家庭（用于链接落地页展示家庭名称）
create or replace function public.get_household_for_invitation(target_token text)
returns table (household_id uuid, household_name text)
language plpgsql
security definer
set search_path = public
stable
as $$
begin
  return query
  select h.id, h.name
  from public.household_invitations hi
  join public.households h on h.id = hi.household_id
  where hi.token = target_token
    and hi.revoked_at is null
    and hi.expires_at > now();
end;
$$;

grant execute on function public.get_household_for_invitation(text) to authenticated;

-- 2. 提交加入申请：校验 token 有效后创建 pending 申请
create or replace function public.submit_household_join_request(target_token text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  current_user_id uuid := auth.uid();
  target_household_id uuid;
  request_id uuid;
begin
  if current_user_id is null then
    raise exception 'login required';
  end if;

  select hi.household_id into target_household_id
  from public.household_invitations hi
  where hi.token = target_token
    and hi.revoked_at is null
    and hi.expires_at > now();

  if target_household_id is null then
    raise exception 'invitation link is invalid or expired';
  end if;

  insert into public.household_join_requests (household_id, user_id, status)
  values (target_household_id, current_user_id, 'pending')
  returning id into request_id;

  return request_id;
end;
$$;

grant execute on function public.submit_household_join_request(text) to authenticated;

-- 3. 房主批准申请：创建 member 关系并把申请置为 approved
create or replace function public.approve_household_join_request(target_request_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  current_user_id uuid := auth.uid();
  target_household_id uuid;
  target_user_id uuid;
begin
  if current_user_id is null then
    raise exception 'login required';
  end if;

  select jr.household_id, jr.user_id
    into target_household_id, target_user_id
  from public.household_join_requests jr
  where jr.id = target_request_id
    and jr.status = 'pending';

  if target_household_id is null then
    raise exception 'join request not found or not pending';
  end if;

  if not exists (
    select 1
    from public.households h
    where h.id = target_household_id
      and h.owner_user_id = current_user_id
  ) then
    raise exception 'only household owner can approve';
  end if;

  insert into public.household_members (household_id, user_id, role)
  values (target_household_id, target_user_id, 'member')
  on conflict (household_id, user_id) do nothing;

  update public.household_join_requests
  set status = 'approved',
      decided_at = now(),
      decided_by = current_user_id
  where id = target_request_id;

  return target_household_id;
end;
$$;

grant execute on function public.approve_household_join_request(uuid) to authenticated;

-- 4. 房主拒绝申请：不创建成员关系，把申请置为 rejected
create or replace function public.reject_household_join_request(target_request_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  current_user_id uuid := auth.uid();
  target_household_id uuid;
begin
  if current_user_id is null then
    raise exception 'login required';
  end if;

  select jr.household_id into target_household_id
  from public.household_join_requests jr
  where jr.id = target_request_id
    and jr.status = 'pending';

  if target_household_id is null then
    raise exception 'join request not found or not pending';
  end if;

  if not exists (
    select 1
    from public.households h
    where h.id = target_household_id
      and h.owner_user_id = current_user_id
  ) then
    raise exception 'only household owner can reject';
  end if;

  update public.household_join_requests
  set status = 'rejected',
      decided_at = now(),
      decided_by = current_user_id
  where id = target_request_id;
end;
$$;

grant execute on function public.reject_household_join_request(uuid) to authenticated;
```

说明：

- `submit_household_join_request` 只能通过有效 token 申请，调用方不能指定要加入哪个 household，避免越权加入任意家庭。
- 同一账号对同一家庭已有 `pending` 申请时，部分唯一索引会拒绝重复申请；前端应提示“已提交申请，等待房主批准”。
- `approve_household_join_request` 只允许目标家庭的 owner 调用，批准后才创建 `member` 关系。
- `reject_household_join_request` 只允许目标家庭的 owner 调用，拒绝不会创建成员关系；被拒绝后同一账号可以重新申请。
- `household_join_requests` 不提供普通前端 insert/update/delete 策略，全部状态变更走安全函数。

## RLS 策略设计

所有 public 用户数据表必须：

```sql
alter table public.profiles enable row level security;
alter table public.households enable row level security;
alter table public.household_members enable row level security;
alter table public.household_invitations enable row level security;
alter table public.household_join_requests enable row level security;
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
- 不允许普通前端直接插入/更新成员关系：owner 关系由注册初始化函数创建，member 关系由 `approve_household_join_request` 安全函数创建。
- 只有 owner 能删除成员记录，且不能删除自己（owner 退出家庭不属于第一版能力）。
- 不做成员角色变更；避免成员把自己提升为 owner。

策略草案：

```sql
create policy "household_members_select_member"
on public.household_members for select
using (public.is_household_member(household_id));

create policy "household_members_delete_owner"
on public.household_members for delete
using (
  exists (
    select 1
    from public.households h
    where h.id = household_id
      and h.owner_user_id = auth.uid()
  )
  and user_id <> auth.uid()
);
```

`household_members` 不提供普通 insert/update 策略：插入只能走安全函数（security definer），角色更新不在第一版范围内。

### household_invitations

规则：

- owner 能看到自己 household 的全部邀请链接（含已作废的历史记录）。
- 只有 owner 能创建和删除邀请链接；链接不绑定成员，申请人不直接读取本表，通过 `get_household_for_invitation` / `submit_household_join_request` 函数使用 token。
- 作废链接 = owner 删除记录；重新生成 = 先删除/作废旧链接再插入新链接。

策略草案：

```sql
create policy "household_invitations_select_owner"
on public.household_invitations for select
using (
  exists (
    select 1
    from public.households h
    where h.id = household_id
      and h.owner_user_id = auth.uid()
  )
);

create policy "household_invitations_insert_owner"
on public.household_invitations for insert
with check (
  created_by = auth.uid()
  and exists (
    select 1
    from public.households h
    where h.id = household_id
      and h.owner_user_id = auth.uid()
  )
);

create policy "household_invitations_delete_owner"
on public.household_invitations for delete
using (
  exists (
    select 1
    from public.households h
    where h.id = household_id
      and h.owner_user_id = auth.uid()
  )
);
```

注意：`household_invitations.token` 是敏感凭证，只允许 owner 读取和删除；申请人只能通过安全函数使用 token，避免链接被枚举或盗用。

### household_join_requests

规则：

- owner 能看到自己 household 的全部加入申请（pending / approved / rejected）。
- 申请人只能看到自己提交的申请记录。
- 不允许普通前端直接 insert/update/delete 申请；提交、批准、拒绝全部走安全函数。

策略草案：

```sql
create policy "household_join_requests_select_owner"
on public.household_join_requests for select
using (
  exists (
    select 1
    from public.households h
    where h.id = household_id
      and h.owner_user_id = auth.uid()
  )
);

create policy "household_join_requests_select_applicant"
on public.household_join_requests for select
using (user_id = auth.uid());
```

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

owner 与 member 对库存数据读写权限相同，策略按成员关系判断，不需要按角色区分。

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

家庭成员加入流程：房主生成邀请链接 → 对方打开链接注册/登录 → 调用 `public.submit_household_join_request(token)` 提交 pending 申请 → 房主调用 `public.approve_household_join_request(request_id)` 创建 `member` 成员关系。注册初始化函数不负责创建 member。

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
| 生成邀请链接 | 必须登录 | 仅 owner 可为自己的 household 创建邀请链接 | RLS | 非 owner 成员或陌生人插入邀请失败 |
| 查看邀请链接 | 必须登录 | 仅 owner 可见自己的邀请链接（含历史） | RLS | 用户 B 看不到用户 A 家庭的邀请链接 |
| 查询链接对应家庭 | 必须登录 | 链接有效时返回家庭信息 | 安全函数 + token 校验 | 无效/过期/作废 token 返回空 |
| 提交加入申请 | 必须登录 | 仅有效 token 可申请，不能指定家庭 | 安全函数 + token 校验 | 无效 token 申请失败；重复 pending 申请失败 |
| 批准/拒绝申请 | 必须登录 | 仅目标家庭 owner 可批准或拒绝 | 安全函数 + owner 校验 | 非 owner 批准失败 |
| 移除成员 | 必须登录 | 仅 owner 可移除，且不能移除自己 | RLS | member 删除他人失败；owner 删除自己失败 |
| 查看成员 | 必须登录 | 仅本家庭成员可见 | RLS | 非成员看不到成员列表 |
| 查看申请 | 必须登录 | owner 看自己家庭的申请；申请人只看自己的申请 | RLS | 用户 B 看不到用户 A 家庭的申请 |

## 验收负例

第一阶段必须验证：

- 未登录用户读取 `items` 返回空或权限错误。
- 用户 A 新增 item 后，用户 B 无法 select 到该 item。
- 用户 B 用用户 A 的 `household_id` insert item 失败。
- 用户 B 用用户 A 的 `item_id` update/delete 失败。
- 用户 A 不能把 item 的 `household_id` 更新成不属于自己的 household。
- 如果 location 属于另一个 household，插入/更新 item 必须失败。
- 未提交申请或被拒绝的账号（无论是否注册）读写共享家庭 areas/locations/items 均返回 0 行或权限错误。
- 成员申请被批准后，可以查看、新增、编辑、删除家庭内的区域、位置和物品；批准前不能。
- 非 owner 成员向 `household_invitations` 插入邀请链接失败；向 `household_members` 插入成员关系失败。
- 非 owner 成员删除其他成员记录失败；owner 删除自己的成员记录失败。
- 无效/过期/已作废 token 调用 `submit_household_join_request` 失败，且不产生任何申请或成员关系。
- 非 owner 调用 `approve_household_join_request` / `reject_household_join_request` 失败。
- 同一账号对同一家庭重复提交 pending 申请违反部分唯一索引。
- 被移除的成员再次读取家庭 areas/locations/items 返回 0 行；家庭数据仍保留在数据库中。
- 同一家庭同一时间只能存在一个未作废邀请链接；重复创建违反部分唯一索引。
- 申请人无法通过普通查询读取 `household_invitations`（token 不暴露）；owner 之外的账号查询返回 0 行。

## 当前验证状态

- Supabase 项目已创建。
- 初始 migration 已由用户在 Supabase SQL Editor 执行成功。
- `202607030001_repair_default_household_rls.sql` 已作为 RLS 和默认 household 初始化修复方案加入仓库。
- `202607030002_reset_inventory_rls_policies.sql` 已作为真实 Supabase 项目 RLS 漂移的二次修复方案加入仓库；用户执行后二次反馈新增物品成功。
- 2026-07-04 用户 A/B 权限负例已在真实 Supabase 项目验证：A 可创建自己的 area/location/item；B 读取 A 的 household/area/location/item 均为 0 行；B 向 A household 插入 area/item 被 RLS 拒绝；B 更新/删除 A item 返回 0 行；未登录 anon 读取 A item 返回 0 行。结果记录见 `dev-docs/acceptance.md`。
- 当前证据支持第一版“用户只能访问自己 household 数据”的 RLS 边界。
- 2026-08-06 家庭成员共享设计已写入真源（`project-brief.md` / `architecture.md` / `database-design.md` / `acceptance.md` / `stages/family-sharing.md`）：邀请方式为分享链接 + 自主申请 + 房主批准，链接落地页含 Android 内测 APK 下载入口。尚未编写 migration，未在任何数据库执行。

## 仍需补充验证

- 在真实浏览器里完整走一遍区域、位置、物品新增/编辑/删除、搜索/筛选、刷新后仍存在的用户验收陪跑。
- 针对 `locations.area_id` 和 `items.location_id` 的跨 household 复合外键负例，后续如单独调整区域/位置关系或共享模型，需要再补更细的数据库负例。
- 家庭共享 migration（`household_invitations` + `household_join_requests` + 成员管理 RLS + 提交/批准/拒绝安全函数）编写并执行后，必须补家庭共享权限负例：未申请/被拒绝不可访问、批准后可读写、member 不能管理成员、被移除立即失效、无效 token 不能申请、非 owner 不能批准。
- 家庭切换器上线后，必须验证切换家庭不会越权读取其他家庭数据，且每个家庭的清单操作都基于当前家庭。

## 下一步

1. 等待用户确认家庭共享设计与实施计划后，编写家庭共享 migration（新建 `household_invitations`、`household_join_requests`、成员管理 RLS、提交/批准/拒绝安全函数），迁移文件必须回写本设计。
2. 收口 `dev-docs/stages/mvp-first-loop.md` 和 `dev-docs/acceptance.md`，保持阶段计划、数据库设计和验收记录一致。
3. 重新运行 `npm test`、`npm run lint`、`npm run build`。
4. 做用户验收陪跑：真实浏览器验证区域/位置/物品 CRUD、搜索/筛选、移动端布局，以及家庭链接邀请/申请/批准/共同编辑/移除成员路径和链接落地页 App 下载入口。
5. 阶段收口后创建 Git checkpoint。
