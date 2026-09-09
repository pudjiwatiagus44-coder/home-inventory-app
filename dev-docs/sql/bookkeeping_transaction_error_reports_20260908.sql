-- 回收站错误订单上报。仅新增结构，不连接、执行或修改任何数据库。
-- 图片文件固定由受控服务存放到：/opt/home-inventory-app/data/bookkeeping-error-reports
-- 禁止把文件放入 public/、静态文件目录、同步目录或日志。
create table if not exists bookkeeping_transaction_error_reports (
  account_id uuid not null references bookkeeping_accounts(id) on delete restrict,
  report_id uuid not null,
  local_transaction_id bigint not null,
  server_transaction_id uuid,
  snapshot jsonb not null,
  reason text not null,
  note text,
  image_object_key text not null,
  image_sha256 text not null,
  authorized_at timestamptz not null,
  created_at timestamptz not null default now(),
  primary key (account_id, report_id),
  constraint bookkeeping_transaction_error_reports_reason_allowed
    check (reason in ('mistaken_delete', 'wrong_amount', 'wrong_category', 'other')),
  constraint bookkeeping_transaction_error_reports_note_length
    check (note is null or char_length(note) <= 1000),
  constraint bookkeeping_transaction_error_reports_snapshot_object
    check (jsonb_typeof(snapshot) = 'object'),
  constraint bookkeeping_transaction_error_reports_image_object_key_not_blank
    check (char_length(btrim(image_object_key)) > 0),
  constraint bookkeeping_transaction_error_reports_image_sha256_hex
    check (image_sha256 ~ '^[0-9a-fA-F]{64}$')
);

create index if not exists bookkeeping_transaction_error_reports_account_created_idx
  on bookkeeping_transaction_error_reports(account_id, created_at desc);

-- 错误订单附件补偿队列。仅存账号、随机对象键和固定错误码；不存订单正文、路径或图片内容。
create table if not exists bookkeeping_error_report_file_cleanup (
  account_id uuid not null references bookkeeping_accounts(id) on delete restrict,
  image_object_key text not null,
  created_at timestamptz not null default now(),
  last_attempt_at timestamptz,
  attempt_count integer not null default 0,
  last_error_code text not null,
  claim_token uuid,
  claim_until timestamptz,
  primary key (account_id, image_object_key),
  constraint bookkeeping_error_report_file_cleanup_image_object_key_unique unique (image_object_key),
  constraint bookkeeping_error_report_file_cleanup_error_code_allowed
    check (last_error_code in (
      'delete_after_database_insert_failed',
      'delete_after_duplicate_conflict',
      'delete_failed'
    )),
  constraint bookkeeping_error_report_file_cleanup_attempt_count_nonnegative
    check (attempt_count >= 0)
);

create index if not exists bookkeeping_error_report_file_cleanup_claim_idx
  on bookkeeping_error_report_file_cleanup(claim_until, created_at);

-- 生产迁移由 postgres 执行时，新表不会自动继承应用角色权限。
-- 报告表仅需运行时查询和插入；补偿队列还需要 claim、更新及成功后的删除。
grant select, insert on bookkeeping_transaction_error_reports to home_inventory_app;
grant select, insert, update, delete on bookkeeping_error_report_file_cleanup to home_inventory_app;
