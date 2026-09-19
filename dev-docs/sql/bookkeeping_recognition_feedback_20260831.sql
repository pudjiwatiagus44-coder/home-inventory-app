create table if not exists bookkeeping_recognition_feedback (
  account_id uuid not null references bookkeeping_accounts(id) on delete cascade,
  id uuid not null,
  source_text text not null check (char_length(source_text) between 1 and 4000),
  original_result jsonb not null,
  corrected_result jsonb not null,
  differences text[] not null,
  model text not null,
  authorized_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (account_id, id),
  constraint bookkeeping_recognition_feedback_differences_not_empty
    check (cardinality(differences) > 0),
  constraint bookkeeping_recognition_feedback_differences_allowed
    check (differences <@ array['amount','category','note','dateTime','type','merchant','other']::text[])
);

create index if not exists bookkeeping_recognition_feedback_account_created_idx
  on bookkeeping_recognition_feedback(account_id, created_at desc);
