-- Allow the same location name under different areas.
-- Uniqueness is scoped to household + area + name; NULL area (未分区) is treated as one group.
alter table locations
  drop constraint if exists locations_unique_name_per_household;

create unique index if not exists locations_unique_name_per_area
  on locations(household_id, area_id, name)
  nulls not distinct;
