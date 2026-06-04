-- ============================================================
-- 染整加工单：保存颜色落缸表手动勾选的颜色
-- 在 Supabase SQL Editor 中运行一次即可
-- ============================================================

ALTER TABLE dyeing_docs
  ADD COLUMN IF NOT EXISTS selected_vat_colors JSONB DEFAULT '[]';
