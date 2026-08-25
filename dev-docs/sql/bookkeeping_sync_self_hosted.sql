-- 一键记账 云同步：bookkeeping_* 独立命名空间迁移（自托管 PostgreSQL）
-- 用途：在 home-inventory-app 数据库中为「一键记账」新增云端账目同步所需表。
-- 原则：仅新增 bookkeeping_* 表，不修改/删除任何既有的 inventory/household/users 表与数据。
-- 执行目标：先测试库 home_inventory_test，再评估生产。本文件仅供测试/经审核后执行。

create table if not exists bookkeeping_accounts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  name text not null default '默认账本',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint bookkeeping_accounts_name_length check (char_length(name) between 1 and 80)
);
create index if not exists bookkeeping_accounts_user_id_idx on bookkeeping_accounts(user_id);

create table if not exists bookkeeping_transactions (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references bookkeeping_accounts(id) on delete cascade,
  amount text not null,
  direction text not null,
  currency text not null default '人民币',
  merchant text not null default '',
  description text not null default '',
  transaction_time text not null,
  source text not null default '',
  status text not null default '',
  payer_payee text not null default '',
  account_label text not null default '',
  participant text not null default '',
  tag text not null default '',
  property text not null default '',
  category_name text not null default '',
  deleted_at timestamptz,
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  constraint bookkeeping_transactions_amount_not_blank check (char_length(amount) > 0),
  constraint bookkeeping_transactions_direction_not_blank check (char_length(direction) > 0)
);
create index if not exists bookkeeping_transactions_account_updated_idx
  on bookkeeping_transactions(account_id, updated_at);
create index if not exists bookkeeping_transactions_account_deleted_idx
  on bookkeeping_transactions(account_id) where deleted_at is null;

create table if not exists bookkeeping_categories (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references bookkeeping_accounts(id) on delete cascade,
  name text not null,
  type text not null default '',
  keywords text not null default '',
  is_builtin boolean not null default false,
  is_active boolean not null default true,
  deleted_at timestamptz,
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  constraint bookkeeping_categories_account_name_unique unique (account_id, name)
);
create index if not exists bookkeeping_categories_account_updated_idx
  on bookkeeping_categories(account_id, updated_at);

create table if not exists bookkeeping_sync_cursors (
  account_id uuid primary key references bookkeeping_accounts(id) on delete cascade,
  last_pull_ts timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
