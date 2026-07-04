-- Repair default household bootstrap and core RLS policies.
-- This migration is idempotent and keeps the MVP permission model unchanged:
-- authenticated users can only read/write rows in households where they are members.

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
  target_household_id uuid;
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
    into target_household_id
  from public.household_members hm
  join public.households h on h.id = hm.household_id
  where hm.user_id = current_user_id
    and hm.role = 'owner'
  order by hm.created_at
  limit 1;

  if target_household_id is null then
    select h.id
      into target_household_id
    from public.households h
    where h.owner_user_id = current_user_id
    order by h.created_at
    limit 1;
  end if;

  if target_household_id is null then
    insert into public.households (owner_user_id, name)
    values (current_user_id, '我的家')
    returning id into target_household_id;
  end if;

  insert into public.household_members (household_id, user_id, role)
  values (target_household_id, current_user_id, 'owner')
  on conflict (household_id, user_id) do update
    set role = 'owner'
    where public.household_members.role <> 'owner';

  insert into public.areas (household_id, name, color, sort_order)
  select target_household_id, '默认区域', '#64748b', 0
  where not exists (
    select 1
    from public.areas a
    where a.household_id = target_household_id
  );

  return target_household_id;
end;
$$;

grant execute on function public.create_default_household(text) to authenticated;

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

drop trigger if exists items_set_created_by on public.items;
create trigger items_set_created_by
before insert on public.items
for each row execute function public.set_item_created_by();

drop policy if exists "locations_insert_member" on public.locations;
create policy "locations_insert_member"
on public.locations for insert
with check (public.is_household_member(household_id));

drop policy if exists "locations_select_member" on public.locations;
create policy "locations_select_member"
on public.locations for select
using (public.is_household_member(household_id));

drop policy if exists "locations_update_member" on public.locations;
create policy "locations_update_member"
on public.locations for update
using (public.is_household_member(household_id))
with check (public.is_household_member(household_id));

drop policy if exists "locations_delete_member" on public.locations;
create policy "locations_delete_member"
on public.locations for delete
using (public.is_household_member(household_id));

drop policy if exists "items_select_member" on public.items;
create policy "items_select_member"
on public.items for select
using (public.is_household_member(household_id));

drop policy if exists "items_insert_member" on public.items;
create policy "items_insert_member"
on public.items for insert
with check (
  public.is_household_member(household_id)
  and (created_by is null or created_by = auth.uid())
);

drop policy if exists "items_update_member" on public.items;
create policy "items_update_member"
on public.items for update
using (public.is_household_member(household_id))
with check (public.is_household_member(household_id));

drop policy if exists "items_delete_member" on public.items;
create policy "items_delete_member"
on public.items for delete
using (public.is_household_member(household_id));
