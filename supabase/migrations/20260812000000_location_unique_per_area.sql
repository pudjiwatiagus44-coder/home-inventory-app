-- Allow the same location name under different areas.
alter table public.locations
  drop constraint if exists locations_unique_name_per_household;

create unique index if not exists locations_unique_name_per_area
  on public.locations(household_id, area_id, name)
  nulls not distinct;
