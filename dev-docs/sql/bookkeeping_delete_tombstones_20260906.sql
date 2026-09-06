-- 回收站同步删除墓碑。仅新增结构，不连接或修改任何数据库。
create table if not exists bookkeeping_delete_tombstones (
  account_id uuid not null references bookkeeping_accounts(id) on delete cascade,
  entity_type text not null,
  server_id uuid not null,
  deleted_at timestamptz not null,
  updated_at timestamptz not null,
  permanently_deleted boolean not null default false,
  primary key (account_id, entity_type, server_id)
);

alter table bookkeeping_delete_tombstones
  add column if not exists entity_type text,
  add column if not exists server_id uuid,
  add column if not exists deleted_at timestamptz,
  add column if not exists updated_at timestamptz,
  add column if not exists permanently_deleted boolean not null default false;

update bookkeeping_delete_tombstones
   set entity_type = coalesce(entity_type, 'transaction'),
       deleted_at = coalesce(deleted_at, now()),
       updated_at = coalesce(updated_at, deleted_at, now())
 where entity_type is null or deleted_at is null or updated_at is null;

alter table bookkeeping_delete_tombstones
  alter column entity_type set not null,
  alter column server_id set not null,
  alter column deleted_at set not null,
  alter column updated_at set not null;

create index if not exists bookkeeping_delete_tombstones_cursor_idx
  on bookkeeping_delete_tombstones(account_id, updated_at);

create unique index if not exists bookkeeping_delete_tombstones_identity_idx
  on bookkeeping_delete_tombstones(account_id, entity_type, server_id);
