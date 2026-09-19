-- 重新识别错误订单字段迁移。仅新增/扩展结构，不执行数据库变更。
-- 部署前由数据库管理员在目标 PostgreSQL 上审核并执行。

alter table if exists bookkeeping_transaction_error_reports
  add column if not exists ocr_text text,
  add column if not exists provider text,
  add column if not exists model text,
  add column if not exists rerecognition_request_id uuid;

alter table if exists bookkeeping_transaction_error_reports
  drop constraint if exists bookkeeping_transaction_error_reports_reason_allowed;

alter table if exists bookkeeping_transaction_error_reports
  add constraint bookkeeping_transaction_error_reports_reason_allowed
  check (reason in ('mistaken_delete', 'wrong_amount', 'wrong_category', 'other', 'rerecognition_replaced'));

alter table if exists bookkeeping_transaction_error_reports
  add constraint bookkeeping_transaction_error_reports_ocr_text_length
  check (ocr_text is null or char_length(ocr_text) <= 12000),
  add constraint bookkeeping_transaction_error_reports_provider_allowed
  check (provider is null or provider in ('DOUBAO', 'QWEN', 'UNKNOWN')),
  add constraint bookkeeping_transaction_error_reports_model_length
  check (model is null or char_length(model) <= 100);

create index if not exists bookkeeping_transaction_error_reports_rerecognition_request_idx
  on bookkeeping_transaction_error_reports(account_id, rerecognition_request_id)
  where rerecognition_request_id is not null;
