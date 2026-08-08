-- Member role levels for the self-hosted route (homestorag.xyz).
-- Truth source: dev-docs/database-design.md (2026-08-08 member roles design).
-- Adds the readonly role level to household_members.

alter table household_members drop constraint if exists household_members_role_check;

alter table household_members
  add constraint household_members_role_check
  check (role in ('owner', 'member', 'readonly'));
