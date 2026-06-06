-- ============================================================
-- 用户/角色档案表 (R1) — 分层级账号系统
-- 在 Supabase SQL Editor 执行一次即可（已有部署补建此表）
-- ============================================================

CREATE TABLE IF NOT EXISTS app_users (
  id TEXT PRIMARY KEY,
  name TEXT DEFAULT '',
  email TEXT DEFAULT '',
  role TEXT DEFAULT 'sales',
  active BOOLEAN DEFAULT TRUE
);

ALTER TABLE app_users ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "允许已登录用户所有操作" ON app_users;
CREATE POLICY "允许已登录用户所有操作" ON app_users FOR ALL USING (auth.role() = 'authenticated');

GRANT SELECT, INSERT, UPDATE, DELETE ON app_users TO authenticated;
