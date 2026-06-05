-- ============================================================
-- 应收对账单：打印/导出使用的收款账户字段
-- 在 Supabase SQL Editor 中运行一次即可
-- ============================================================

ALTER TABLE ar_records
  ADD COLUMN IF NOT EXISTS receipt_account_type TEXT DEFAULT 'company',
  ADD COLUMN IF NOT EXISTS receipt_account_name TEXT DEFAULT '',
  ADD COLUMN IF NOT EXISTS receipt_account_bank TEXT DEFAULT '',
  ADD COLUMN IF NOT EXISTS receipt_account_no TEXT DEFAULT '',
  ADD COLUMN IF NOT EXISTS receipt_account_note TEXT DEFAULT '';
