-- Area and location photo schema for the self-hosted route.
-- Truth source: dev-docs/database-design.md (2026-08-11 area/location photos design).

alter table areas add column if not exists photo_key text;
alter table locations add column if not exists photo_key text;

create unique index if not exists areas_photo_key_unique
  on areas(photo_key) where photo_key is not null;

create unique index if not exists locations_photo_key_unique
  on locations(photo_key) where photo_key is not null;
