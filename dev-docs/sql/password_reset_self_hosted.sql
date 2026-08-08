-- Password reset tokens for the self-hosted route (homestorag.xyz).
-- Truth source: dev-docs/database-design.md (2026-08-08 password reset design).
-- Tokens are stored as HMAC-SHA256 hashes only; the plain token is sent to the
-- user by email and never persisted. Permission enforcement happens in the
-- Next.js service layer (server-side checks).

create table if not exists password_reset_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  token_hash text not null,
  expires_at timestamptz not null,
  used_at timestamptz,
  created_at timestamptz not null default now(),
  constraint password_reset_tokens_token_hash_unique unique (token_hash),
  constraint password_reset_tokens_token_hash_not_blank check (char_length(token_hash) > 0),
  constraint password_reset_tokens_expires_after_created check (expires_at > created_at)
);

create index if not exists password_reset_tokens_user_id_idx on password_reset_tokens(user_id);
create index if not exists password_reset_tokens_expires_at_idx on password_reset_tokens(expires_at);

grant all privileges on password_reset_tokens to home_inventory_app;
