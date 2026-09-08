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
