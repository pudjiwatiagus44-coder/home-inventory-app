-- 为已存在的 bookkeeping_categories 表补齐分类层级与展示字段。
-- 幂等、仅新增字段/索引，不删除或覆盖既有账目。
alter table bookkeeping_categories
  add column if not exists parent_category_id uuid references bookkeeping_categories(id),
  add column if not exists description text not null default '',
  add column if not exists icon text not null default '',
  add column if not exists color text not null default '',
  add column if not exists sort_order integer not null default 0;

create index if not exists bookkeeping_categories_parent_idx
  on bookkeeping_categories(account_id, parent_category_id);
