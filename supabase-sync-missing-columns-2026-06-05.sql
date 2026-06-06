-- ============================================================
-- 同步缺列补丁：解决刷新前安全检查中 fg_outs / ar_records 上传失败
-- 在 Supabase SQL Editor 中运行一次即可。
-- 说明：
--   1. status / duplicate_of / no_restock_on_void / void_reason / voided_at
--      用于送货单状态和重复送货单“作废不回仓”审计。
--   2. receipt_account_* 用于应收对账单打印时的收款账户快照。
-- ============================================================

ALTER TABLE fg_outs
  ADD COLUMN IF NOT EXISTS status TEXT DEFAULT '',
  ADD COLUMN IF NOT EXISTS duplicate_of TEXT DEFAULT '',
  ADD COLUMN IF NOT EXISTS no_restock_on_void BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS void_reason TEXT DEFAULT '',
  ADD COLUMN IF NOT EXISTS voided_at TEXT DEFAULT '';

ALTER TABLE ar_records
  ADD COLUMN IF NOT EXISTS receipt_account_type TEXT DEFAULT 'company',
  ADD COLUMN IF NOT EXISTS receipt_account_name TEXT DEFAULT '',
  ADD COLUMN IF NOT EXISTS receipt_account_bank TEXT DEFAULT '',
  ADD COLUMN IF NOT EXISTS receipt_account_no TEXT DEFAULT '',
  ADD COLUMN IF NOT EXISTS receipt_account_note TEXT DEFAULT '';
