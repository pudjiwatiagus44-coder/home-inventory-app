-- Family sharing schema for the self-hosted route (homestorag.xyz).
-- Truth source: dev-docs/database-design.md (2026-08-06 family sharing design).
-- Permission enforcement happens in the Next.js service layer (server-side checks),
-- equivalent to the RLS policies documented in database-design.md.

create table if not exists household_invitations (
  id uuid primary key default gen_random_uuid(),
  household_id uuid references households(id) on delete cascade,
  token text not null,
  created_by uuid not null references users(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  expires_at timestamptz not null,
  revoked_at timestamptz,
  constraint household_invitations_token_unique unique (token),
  constraint household_invitations_token_length check (char_length(token) between 20 and 200),
  constraint household_invitations_expires_after_created check (expires_at > created_at)
);

create table if not exists household_invitation_grants (
  invitation_id uuid not null references household_invitations(id) on delete cascade,
  household_id uuid not null references households(id) on delete cascade,
  role text not null default 'member',
  created_at timestamptz not null default now(),
  primary key (invitation_id, household_id),
  constraint household_invitation_grants_role_check
    check (role in ('member', 'contributor', 'readonly'))
);

create table if not exists household_join_requests (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references households(id) on delete cascade,
  invitation_id uuid references household_invitations(id) on delete set null,
  user_id uuid not null references users(id) on delete cascade,
  status text not null default 'pending',
  created_at timestamptz not null default now(),
  decided_at timestamptz,
  decided_by uuid references users(id) on delete set null,
  constraint household_join_requests_status_check check (status in ('pending', 'approved', 'rejected'))
);

create unique index if not exists household_invitations_active_one_per_household_idx
  on household_invitations(household_id) where revoked_at is null;
create index if not exists household_invitations_token_idx on household_invitations(token);
create index if not exists household_invitations_household_id_idx on household_invitations(household_id);
create index if not exists household_invitation_grants_invitation_id_idx on household_invitation_grants(invitation_id);

create unique index if not exists household_join_requests_pending_unique_idx
  on household_join_requests(household_id, user_id) where status = 'pending';
create index if not exists household_join_requests_household_id_idx on household_join_requests(household_id);
create index if not exists household_join_requests_user_id_idx on household_join_requests(user_id);
create index if not exists household_join_requests_invitation_id_idx on household_join_requests(invitation_id);

-- Grant the application role the same privileges it has on existing tables.
grant all privileges on household_invitations to home_inventory_app;
grant all privileges on household_invitation_grants to home_inventory_app;
grant all privileges on household_join_requests to home_inventory_app;
