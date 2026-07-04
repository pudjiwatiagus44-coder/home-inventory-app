-- Reset inventory RLS policies to the project truth.
-- This version avoids dynamic SQL so it is easier to paste into Supabase SQL Editor.
-- It does not change tables, columns, or the MVP single-account ownership model.

drop policy if exists "areas_select_member" on public.areas;
drop policy if exists "areas_insert_member" on public.areas;
drop policy if exists "areas_update_member" on public.areas;
drop policy if exists "areas_delete_member" on public.areas;

drop policy if exists "locations_select_member" on public.locations;
drop policy if exists "locations_insert_member" on public.locations;
drop policy if exists "locations_update_member" on public.locations;
drop policy if exists "locations_delete_member" on public.locations;

drop policy if exists "items_select_member" on public.items;
drop policy if exists "items_insert_member" on public.items;
drop policy if exists "items_update_member" on public.items;
drop policy if exists "items_delete_member" on public.items;

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

alter table public.areas enable row level security;
alter table public.locations enable row level security;
alter table public.items enable row level security;

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

select
  schemaname,
  tablename,
  policyname,
  permissive,
  roles,
  cmd,
  qual,
  with_check
from pg_policies
where schemaname = 'public'
  and tablename in ('areas', 'locations', 'items')
order by tablename, policyname;
