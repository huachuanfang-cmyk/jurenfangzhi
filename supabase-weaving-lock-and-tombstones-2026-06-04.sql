-- ============================================================
-- 巨人纺织 ERP - 织厂加工单锁定状态 + 删除墓碑补丁
-- 用途：在已有 Supabase 项目中执行，配合 2026-06-04 织厂加工单升级
-- ============================================================

ALTER TABLE weaving_docs
  ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'draft',
  ADD COLUMN IF NOT EXISTS issued_at TEXT DEFAULT '',
  ADD COLUMN IF NOT EXISTS unlock_reason TEXT DEFAULT '',
  ADD COLUMN IF NOT EXISTS selected_colors JSONB DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS color_kg_map JSONB DEFAULT '{}';

CREATE TABLE IF NOT EXISTS tombstones (
  id TEXT PRIMARY KEY,
  biz_key TEXT NOT NULL,
  record_id TEXT NOT NULL,
  table_name TEXT DEFAULT '',
  deleted_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE tombstones ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'tombstones'
      AND policyname = '允许已登录用户所有操作'
  ) THEN
    CREATE POLICY "允许已登录用户所有操作"
      ON tombstones
      FOR ALL
      USING (auth.role() = 'authenticated');
  END IF;
END $$;

GRANT SELECT, INSERT, UPDATE, DELETE ON tombstones TO authenticated;

CREATE INDEX IF NOT EXISTS idx_tombstones_biz_record
  ON tombstones(biz_key, record_id);
