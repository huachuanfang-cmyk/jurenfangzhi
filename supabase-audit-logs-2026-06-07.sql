-- ============================================================
-- 操作日志/审计表 — 谁、何时、改了什么单据（append-only）
-- 在 Supabase SQL Editor 执行一次即可
-- ============================================================

CREATE TABLE IF NOT EXISTS audit_logs (
  id TEXT PRIMARY KEY,
  ts TIMESTAMPTZ DEFAULT NOW(),
  user_email TEXT DEFAULT '',
  user_name TEXT DEFAULT '',
  role TEXT DEFAULT '',
  action TEXT DEFAULT '',
  entity TEXT DEFAULT '',
  entity_id TEXT DEFAULT '',
  detail TEXT DEFAULT ''
);

ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "允许已登录用户所有操作" ON audit_logs;
CREATE POLICY "允许已登录用户所有操作" ON audit_logs FOR ALL USING (auth.role() = 'authenticated');

GRANT SELECT, INSERT, UPDATE, DELETE ON audit_logs TO authenticated;

-- 按时间倒序查询的索引
CREATE INDEX IF NOT EXISTS audit_logs_ts_idx ON audit_logs (ts DESC);
