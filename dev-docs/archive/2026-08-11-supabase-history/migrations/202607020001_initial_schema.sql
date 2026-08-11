-- Initial schema for Home Inventory App.
-- Auth is owned by Supabase. App data lives in public schema with RLS enabled.

create extension if not exists pgcrypto;

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint profiles_display_name_length check (char_length(display_name) <= 80)
);

create table public.households (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  name text not null default '我的家',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint households_name_length check (char_length(name) between 1 and 80),
  constraint households_id_owner_unique unique (id, owner_user_id)
);

create table public.household_members (
  household_id uuid not null references public.households(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'owner',
  created_at timestamptz not null default now(),
  primary key (household_id, user_id),
  constraint household_members_role_check check (role in ('owner', 'member'))
);

create table public.areas (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  name text not null,
  color text not null default '#64748b',
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint areas_name_length check (char_length(name) between 1 and 80),
  constraint areas_color_format check (color ~ '^#[0-9A-Fa-f]{6}$'),
  constraint areas_id_household_unique unique (id, household_id),
  constraint areas_unique_name_per_household unique (household_id, name)
);

create table public.locations (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  area_id uuid,
  name text not null,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint locations_name_length check (char_length(name) between 1 and 80),
  constraint locations_id_household_unique unique (id, household_id),
  constraint locations_unique_name_per_household unique (household_id, name),
  constraint locations_area_same_household_fk
    foreign key (area_id, household_id)
    references public.areas(id, household_id)
    on delete set null (area_id)
);

create table public.items (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  location_id uuid,
  name text not null,
  note text not null default '',
  expire_date date,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint items_name_length check (char_length(name) between 1 and 120),
  constraint items_note_length check (char_length(note) <= 1000),
  constraint items_location_same_household_fk
    foreign key (location_id, household_id)
    references public.locations(id, household_id)
    on delete set null (location_id)
);

create index households_owner_user_id_idx on public.households(owner_user_id);
create index household_members_user_id_idx on public.household_members(user_id);
create index areas_household_id_sort_idx on public.areas(household_id, sort_order, created_at);
create index locations_household_id_sort_idx on public.locations(household_id, sort_order, created_at);
create index items_household_id_created_at_idx on public.items(household_id, created_at desc);
create index items_location_id_idx on public.items(location_id);
create index items_expire_date_idx on public.items(expire_date) where expire_date is not null;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger profiles_set_updated_at
before update on public.profiles
for each row execute function public.set_updated_at();

create trigger households_set_updated_at
before update on public.households
for each row execute function public.set_updated_at();

create trigger areas_set_updated_at
before update on public.areas
for each row execute function public.set_updated_at();

create trigger locations_set_updated_at
before update on public.locations
for each row execute function public.set_updated_at();

create trigger items_set_updated_at
before update on public.items
for each row execute function public.set_updated_at();

create or replace function public.set_item_created_by()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.created_by is null then
    new.created_by = auth.uid();
  end if;
  return new;
end;
$$;

create trigger items_set_created_by
before insert on public.items
for each row execute function public.set_item_created_by();

alter table public.profiles enable row level security;
alter table public.households enable row level security;
alter table public.household_members enable row level security;
alter table public.areas enable row level security;
alter table public.locations enable row level security;
alter table public.items enable row level security;

create or replace function public.is_household_member(target_household_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1
    from public.household_members hm
    where hm.household_id = target_household_id
      and hm.user_id = auth.uid()
  );
$$;

create or replace function public.create_default_household(display_name text default '')
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  current_user_id uuid := auth.uid();
  household_id uuid;
begin
  if current_user_id is null then
    raise exception 'login required';
  end if;

  insert into public.profiles (id, display_name)
  values (current_user_id, coalesce(display_name, ''))
  on conflict (id) do update
    set display_name = excluded.display_name
    where public.profiles.display_name = '';

  select hm.household_id
    into household_id
  from public.household_members hm
  where hm.user_id = current_user_id
    and hm.role = 'owner'
  order by hm.created_at
  limit 1;

  if household_id is not null then
    return household_id;
  end if;

  insert into public.households (owner_user_id, name)
  values (current_user_id, '我的家')
  returning id into household_id;

  insert into public.household_members (household_id, user_id, role)
  values (household_id, current_user_id, 'owner');

  insert into public.areas (household_id, name, color, sort_order)
  values
    (household_id, '默认区域', '#64748b', 0);

  return household_id;
end;
$$;

grant execute on function public.create_default_household(text) to authenticated;

create policy "profiles_select_own"
on public.profiles for select
using (id = auth.uid());

create policy "profiles_insert_own"
on public.profiles for insert
with check (id = auth.uid());

create policy "profiles_update_own"
on public.profiles for update
using (id = auth.uid())
with check (id = auth.uid());

create policy "households_select_member"
on public.households for select
using (public.is_household_member(id));

create policy "households_update_owner"
on public.households for update
using (owner_user_id = auth.uid())
with check (owner_user_id = auth.uid());

create policy "households_delete_owner"
on public.households for delete
using (owner_user_id = auth.uid());

create policy "household_members_select_member"
on public.household_members for select
using (public.is_household_member(household_id));

create policy "areas_select_member"
on public.areas for select
using (public.is_household_member(household_id));

create policy "areas_insert_member"
on public.areas for insert
with check (public.is_household_member(household_id));

create policy "areas_update_member"
on public.areas for update
using (public.is_household_member(household_id))
with check (public.is_household_member(household_id));

create policy "areas_delete_member"
on public.areas for delete
using (public.is_household_member(household_id));

create policy "locations_select_member"
on public.locations for select
using (public.is_household_member(household_id));

create policy "locations_insert_member"
on public.locations for insert
with check (public.is_household_member(household_id));

create policy "locations_update_member"
on public.locations for update
using (public.is_household_member(household_id))
with check (public.is_household_member(household_id));

create policy "locations_delete_member"
on public.locations for delete
using (public.is_household_member(household_id));

create policy "items_select_member"
on public.items for select
using (public.is_household_member(household_id));

create policy "items_insert_member"
on public.items for insert
with check (
  public.is_household_member(household_id)
  and (created_by is null or created_by = auth.uid())
);

create policy "items_update_member"
on public.items for update
using (public.is_household_member(household_id))
with check (public.is_household_member(household_id));

create policy "items_delete_member"
on public.items for delete
using (public.is_household_member(household_id));
