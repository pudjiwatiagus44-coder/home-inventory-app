-- Household personal display names and future scoped authorization roles.
-- Self-hosted PostgreSQL route only. Permission enforcement stays in the
-- Next.js service layer; this migration does not use Supabase/RLS.

alter table household_members drop constraint if exists household_members_role_check;

alter table household_members
  add constraint household_members_role_check
  check (role in ('owner', 'member', 'contributor', 'readonly'));

create table if not exists household_user_preferences (
  user_id uuid not null references users(id) on delete cascade,
  household_id uuid not null references households(id) on delete cascade,
  display_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, household_id),
  constraint household_user_preferences_display_name_length
    check (display_name is null or char_length(display_name) <= 50)
);

drop trigger if exists household_user_preferences_set_updated_at
  on household_user_preferences;

create trigger household_user_preferences_set_updated_at
before update on household_user_preferences
for each row execute function set_updated_at();

grant all privileges on household_user_preferences to home_inventory_app;
