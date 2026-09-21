-- 账号级 DeepSeek 凭据。仅新增结构，不连接、执行或修改任何数据库。
-- 仅保存 AES-256-GCM 密文及必要元数据，禁止保存明文 API Key。
-- 所有读写必须使用服务器会话推导的 user_id，绝不可相信客户端提交的 user_id。
create table if not exists bookkeeping_deepseek_credentials (
  user_id uuid primary key references users(id) on delete cascade,
  key_version integer not null check (key_version > 0),
  ciphertext bytea not null,
  nonce bytea not null,
  authentication_tag bytea not null,
  last_four text not null check (char_length(last_four) = 4),
  last_verified_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists bookkeeping_deepseek_credentials_set_updated_at
  on bookkeeping_deepseek_credentials;

create trigger bookkeeping_deepseek_credentials_set_updated_at
  before update on bookkeeping_deepseek_credentials
  for each row execute function set_updated_at();

-- 生产迁移由 PostgreSQL 管理员单独执行；本文件不会自动连接任何数据库。
grant select, insert, update, delete on bookkeeping_deepseek_credentials to home_inventory_app;
