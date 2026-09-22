-- Per-account rolling-window and in-flight leases for hosted Qwen credential checks.
-- This migration is not applied automatically and must never be pointed at production without approval.
create table if not exists bookkeeping_qwen_credential_rate_limits (
  user_id uuid not null references users(id) on delete cascade,
  request_id uuid not null,
  started_at timestamptz not null,
  completed_at timestamptz null,
  primary key (user_id, request_id)
);

create index if not exists bookkeeping_qwen_credential_rate_limits_started_at_idx
  on bookkeeping_qwen_credential_rate_limits (user_id, started_at);

grant select, insert, update, delete on bookkeeping_qwen_credential_rate_limits to home_inventory_app;
