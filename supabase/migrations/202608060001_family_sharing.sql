-- Family sharing migration for Home Inventory App.
-- Truth source: dev-docs/database-design.md (2026-08-06 family sharing design).
--
-- Adds:
--   household_invitations      - invitation share links (token, expiry, revocation)
--   household_join_requests    - join applications (pending / approved / rejected)
--   RLS policies for both tables and owner-managed member removal
--   security-definer functions:
--     get_household_for_invitation(text)
--     submit_household_join_request(text)
--     approve_household_join_request(uuid)
--     reject_household_join_request(uuid)

create table public.household_invitations (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  token text not null,
  created_by uuid not null default auth.uid() references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  expires_at timestamptz not null,
  revoked_at timestamptz,
  constraint household_invitations_token_unique unique (token),
  constraint household_invitations_token_length check (char_length(token) between 20 and 200),
  constraint household_invitations_expires_after_created check (expires_at > created_at)
);

create table public.household_join_requests (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  status text not null default 'pending',
  created_at timestamptz not null default now(),
  decided_at timestamptz,
  decided_by uuid references auth.users(id) on delete set null,
  constraint household_join_requests_status_check check (status in ('pending', 'approved', 'rejected'))
);

create index household_invitations_household_id_idx on public.household_invitations(household_id);
create index household_invitations_token_idx on public.household_invitations(token);
create unique index household_invitations_active_one_per_household_idx
  on public.household_invitations(household_id)
  where revoked_at is null;

create index household_join_requests_household_id_idx on public.household_join_requests(household_id);
create index household_join_requests_user_id_idx on public.household_join_requests(user_id);
create unique index household_join_requests_pending_unique_idx
  on public.household_join_requests(household_id, user_id)
  where status = 'pending';

create trigger household_invitations_set_updated_at
before update on public.household_invitations
for each row execute function public.set_updated_at();

alter table public.household_invitations enable row level security;
alter table public.household_join_requests enable row level security;

-- Look up the household for a valid invitation token (landing page).
create or replace function public.get_household_for_invitation(target_token text)
returns table (household_id uuid, household_name text)
language plpgsql
security definer
set search_path = public
stable
as $$
begin
  if auth.uid() is null then
    raise exception 'login required';
  end if;

  return query
  select h.id, h.name
  from public.household_invitations hi
  join public.households h on h.id = hi.household_id
  where hi.token = target_token
    and hi.revoked_at is null
    and hi.expires_at > now();
end;
$$;

grant execute on function public.get_household_for_invitation(text) to authenticated;

-- Submit a join application for a valid invitation token.
create or replace function public.submit_household_join_request(target_token text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  current_user_id uuid := auth.uid();
  target_household_id uuid;
  request_id uuid;
begin
  if current_user_id is null then
    raise exception 'login required';
  end if;

  select hi.household_id into target_household_id
  from public.household_invitations hi
  where hi.token = target_token
    and hi.revoked_at is null
    and hi.expires_at > now();

  if target_household_id is null then
    raise exception 'invitation link is invalid or expired';
  end if;

  insert into public.household_join_requests (household_id, user_id, status)
  values (target_household_id, current_user_id, 'pending')
  on conflict (household_id, user_id) where status = 'pending' do nothing
  returning id into request_id;

  if request_id is null then
    select id into request_id
    from public.household_join_requests
    where household_id = target_household_id
      and user_id = current_user_id
      and status = 'pending';
  end if;

  return request_id;
end;
$$;

grant execute on function public.submit_household_join_request(text) to authenticated;

-- Owner approves a join application: creates the member relationship.
create or replace function public.approve_household_join_request(target_request_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  current_user_id uuid := auth.uid();
  target_household_id uuid;
  target_user_id uuid;
begin
  if current_user_id is null then
    raise exception 'login required';
  end if;

  select jr.household_id, jr.user_id
    into target_household_id, target_user_id
  from public.household_join_requests jr
  where jr.id = target_request_id
    and jr.status = 'pending';

  if target_household_id is null then
    raise exception 'join request not found or not pending';
  end if;

  if not exists (
    select 1
    from public.households h
    where h.id = target_household_id
      and h.owner_user_id = current_user_id
  ) then
    raise exception 'only household owner can approve';
  end if;

  insert into public.household_members (household_id, user_id, role)
  values (target_household_id, target_user_id, 'member')
  on conflict (household_id, user_id) do nothing;

  update public.household_join_requests
  set status = 'approved',
      decided_at = now(),
      decided_by = current_user_id
  where id = target_request_id;

  return target_household_id;
end;
$$;

grant execute on function public.approve_household_join_request(uuid) to authenticated;

-- Owner rejects a join application without creating a member relationship.
create or replace function public.reject_household_join_request(target_request_id uuid)
returns void
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

  select jr.household_id into target_household_id
  from public.household_join_requests jr
  where jr.id = target_request_id
    and jr.status = 'pending';

  if target_household_id is null then
    raise exception 'join request not found or not pending';
  end if;

  if not exists (
    select 1
    from public.households h
    where h.id = target_household_id
      and h.owner_user_id = current_user_id
  ) then
    raise exception 'only household owner can reject';
  end if;

  update public.household_join_requests
  set status = 'rejected',
      decided_at = now(),
      decided_by = current_user_id
  where id = target_request_id;
end;
$$;

grant execute on function public.reject_household_join_request(uuid) to authenticated;

-- List members of a household with emails; only household members can call it.
create or replace function public.list_household_members(target_household_id uuid)
returns table (user_id uuid, email text, role text, created_at timestamptz)
language plpgsql
security definer
set search_path = public
stable
as $$
begin
  if not public.is_household_member(target_household_id) then
    raise exception 'only household members can list members';
  end if;

  return query
  select hm.user_id, au.email, hm.role, hm.created_at
  from public.household_members hm
  join auth.users au on au.id = hm.user_id
  where hm.household_id = target_household_id
  order by
    case when hm.role = 'owner' then 0 else 1 end,
    hm.created_at asc;
end;
$$;

grant execute on function public.list_household_members(uuid) to authenticated;

-- List join requests of a household with applicant emails; only the owner can call it.
create or replace function public.list_household_join_requests(target_household_id uuid)
returns table (id uuid, user_id uuid, email text, status text, created_at timestamptz)
language plpgsql
security definer
set search_path = public
stable
as $$
begin
  if not exists (
    select 1
    from public.households h
    where h.id = target_household_id
      and h.owner_user_id = auth.uid()
  ) then
    raise exception 'only household owner can list join requests';
  end if;

  return query
  select jr.id, jr.user_id, au.email, jr.status, jr.created_at
  from public.household_join_requests jr
  join auth.users au on au.id = jr.user_id
  where jr.household_id = target_household_id
  order by jr.created_at desc;
end;
$$;

grant execute on function public.list_household_join_requests(uuid) to authenticated;

-- Invitation links: only the household owner can see, create, or delete them.
create policy "household_invitations_select_owner"
on public.household_invitations for select
using (
  exists (
    select 1
    from public.households h
    where h.id = household_id
      and h.owner_user_id = auth.uid()
  )
);

create policy "household_invitations_insert_owner"
on public.household_invitations for insert
with check (
  exists (
    select 1
    from public.households h
    where h.id = household_id
      and h.owner_user_id = auth.uid()
  )
);

create policy "household_invitations_delete_owner"
on public.household_invitations for delete
using (
  exists (
    select 1
    from public.households h
    where h.id = household_id
      and h.owner_user_id = auth.uid()
  )
);

-- Join requests: owner sees requests for their household; applicants see their own.
create policy "household_join_requests_select_owner"
on public.household_join_requests for select
using (
  exists (
    select 1
    from public.households h
    where h.id = household_id
      and h.owner_user_id = auth.uid()
  )
);

create policy "household_join_requests_select_applicant"
on public.household_join_requests for select
using (user_id = auth.uid());

-- Owner can remove members, but cannot remove themselves.
create policy "household_members_delete_owner"
on public.household_members for delete
using (
  exists (
    select 1
    from public.households h
    where h.id = household_id
      and h.owner_user_id = auth.uid()
  )
  and user_id <> auth.uid()
);
