-- 账号级豆包凭据。仅新增结构，不连接、执行或修改任何数据库。
-- 只保存应用层加密后的密文、AES-GCM 参数和脱敏尾号，禁止保存明文 API Key。
create table if not exists bookkeeping_doubao_credentials (
  account_id uuid primary key references bookkeeping_accounts(id) on delete cascade,
  encrypted_api_key bytea not null,
  encryption_nonce bytea not null,
  encryption_tag bytea not null,
  key_version integer not null,
  status text not null,
  enabled boolean not null default true,
  last_four text not null,
  last_verified_at timestamptz,
  last_success_at timestamptz,
  last_error_code text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint bookkeeping_doubao_credentials_status_allowed
    check (status in ('ACTIVE', 'QUOTA_EXHAUSTED', 'AUTH_INVALID')),
  constraint bookkeeping_doubao_credentials_key_version_positive
    check (key_version > 0),
  constraint bookkeeping_doubao_credentials_last_four_length
    check (char_length(last_four) = 4)
);

drop trigger if exists bookkeeping_doubao_credentials_set_updated_at
  on bookkeeping_doubao_credentials;

create trigger bookkeeping_doubao_credentials_set_updated_at
  before update on bookkeeping_doubao_credentials
  for each row execute function set_updated_at();

-- 生产迁移由 postgres 执行时，新表不会自动继承应用角色权限。
grant select, insert, update, delete on bookkeeping_doubao_credentials to home_inventory_app;
