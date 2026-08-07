-- Photo recognition schema for the self-hosted route (homestorag.xyz).
-- Truth source: dev-docs/database-design.md (2026-08-07 photo recognition design).
-- Permission enforcement happens in the Next.js service layer (server-side checks),
-- equivalent to the RLS policies documented in database-design.md.

alter table items add column if not exists photo_key text;

create unique index if not exists items_photo_key_unique
  on items(photo_key) where photo_key is not null;

create table if not exists pending_photos (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references households(id) on delete cascade,
  photo_key text not null,
  created_by uuid not null references users(id) on delete cascade,
  created_at timestamptz not null default now(),
  status text not null default 'pending',
  constraint pending_photos_photo_key_unique unique (photo_key),
  constraint pending_photos_status_check check (status in ('pending', 'attached'))
);

create index if not exists pending_photos_created_by_idx on pending_photos(created_by);
create index if not exists pending_photos_household_id_idx on pending_photos(household_id);
create index if not exists pending_photos_status_created_at_idx on pending_photos(status, created_at);

grant all privileges on pending_photos to home_inventory_app;
