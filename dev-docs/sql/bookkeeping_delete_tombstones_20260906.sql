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

create index if not exists bookkeeping_delete_tombstones_cursor_idx
  on bookkeeping_delete_tombstones(account_id, updated_at);
