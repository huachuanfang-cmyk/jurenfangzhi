-- ============================================================
-- 染整加工单：下达锁定状态字段
-- 在 Supabase SQL Editor 中运行一次即可
-- ============================================================

ALTER TABLE dyeing_docs
  ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'draft',
  ADD COLUMN IF NOT EXISTS issued_at TEXT DEFAULT '',
  ADD COLUMN IF NOT EXISTS unlock_reason TEXT DEFAULT '';
