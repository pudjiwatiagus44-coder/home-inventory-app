-- Mainland PostgreSQL schema draft for Home Inventory App.
-- This file is a design draft. Do not run against production without a reviewed migration plan.
-- Auth is owned by the Next.js server. App data is protected by server-side permission checks.

create extension if not exists pgcrypto;

create table users (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  password_hash text not null,
  email_verified_at timestamptz,
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint users_email_unique unique (email),
  constraint users_email_not_blank check (char_length(trim(email)) > 0),
  constraint users_password_hash_not_blank check (char_length(password_hash) > 0),
  constraint users_status_check check (status in ('active', 'disabled'))
);

create table auth_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  session_token_hash text not null,
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  last_seen_at timestamptz,
  revoked_at timestamptz,
  constraint auth_sessions_token_hash_unique unique (session_token_hash),
  constraint auth_sessions_token_hash_not_blank check (char_length(session_token_hash) > 0)
);

create table profiles (
  id uuid primary key references users(id) on delete cascade,
  display_name text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint profiles_display_name_length check (char_length(display_name) <= 80)
);

create table households (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references users(id) on delete cascade,
  name text not null default '我的家',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint households_name_length check (char_length(name) between 1 and 80),
  constraint households_id_owner_unique unique (id, owner_user_id)
);

create table household_members (
  household_id uuid not null references households(id) on delete cascade,
  user_id uuid not null references users(id) on delete cascade,
  role text not null default 'owner',
  created_at timestamptz not null default now(),
  primary key (household_id, user_id),
  constraint household_members_role_check check (role in ('owner', 'member', 'contributor', 'readonly'))
);

create table household_user_preferences (
  user_id uuid not null references users(id) on delete cascade,
  household_id uuid not null references households(id) on delete cascade,
  display_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, household_id),
  constraint household_user_preferences_display_name_length
    check (display_name is null or char_length(display_name) <= 50)
);

create table areas (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references households(id) on delete cascade,
  name text not null,
  color text not null default '#64748b',
  photo_key text,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint areas_name_length check (char_length(name) between 1 and 80),
  constraint areas_color_format check (color ~ '^#[0-9A-Fa-f]{6}$'),
  constraint areas_id_household_unique unique (id, household_id),
  constraint areas_unique_name_per_household unique (household_id, name)
);

create table locations (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references households(id) on delete cascade,
  area_id uuid,
  name text not null,
  created_by uuid references users(id) on delete set null,
  photo_key text,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint locations_name_length check (char_length(name) between 1 and 80),
  constraint locations_id_household_unique unique (id, household_id),
  constraint locations_unique_name_per_household unique (household_id, name),
  constraint locations_area_same_household_fk
    foreign key (area_id, household_id)
    references areas(id, household_id)
    on delete set null (area_id)
);

create table items (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references households(id) on delete cascade,
  location_id uuid,
  name text not null,
  note text not null default '',
  expire_date date,
  photo_key text,
  created_by uuid references users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint items_name_length check (char_length(name) between 1 and 120),
  constraint items_note_length check (char_length(note) <= 1000),
  constraint items_location_same_household_fk
    foreign key (location_id, household_id)
    references locations(id, household_id)
    on delete set null (location_id)
);

create index users_email_lower_idx on users(lower(email));
create index auth_sessions_user_id_idx on auth_sessions(user_id);
create index auth_sessions_expires_at_idx on auth_sessions(expires_at);
create index households_owner_user_id_idx on households(owner_user_id);
create index household_members_user_id_idx on household_members(user_id);
create index areas_household_id_sort_idx on areas(household_id, sort_order, created_at);
create index locations_household_id_sort_idx on locations(household_id, sort_order, created_at);
create index items_household_id_created_at_idx on items(household_id, created_at desc);
create unique index areas_photo_key_unique on areas(photo_key) where photo_key is not null;
create unique index locations_photo_key_unique on locations(photo_key) where photo_key is not null;
create unique index items_photo_key_unique on items(photo_key) where photo_key is not null;
create index items_location_id_idx on items(location_id);
create index items_expire_date_idx on items(expire_date) where expire_date is not null;

create or replace function set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger users_set_updated_at
before update on users
for each row execute function set_updated_at();

create trigger profiles_set_updated_at
before update on profiles
for each row execute function set_updated_at();

create trigger households_set_updated_at
before update on households
for each row execute function set_updated_at();

create trigger household_user_preferences_set_updated_at
before update on household_user_preferences
for each row execute function set_updated_at();

create trigger areas_set_updated_at
before update on areas
for each row execute function set_updated_at();

create trigger locations_set_updated_at
before update on locations
for each row execute function set_updated_at();

create trigger items_set_updated_at
before update on items
for each row execute function set_updated_at();
