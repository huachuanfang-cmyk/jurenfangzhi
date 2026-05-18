-- 在 Supabase SQL Editor 中运行此脚本
-- 创建打办通知单表 + 授权 + 关闭RLS

-- 如果表已存在则跳过创建
CREATE TABLE IF NOT EXISTS color_notices (
  id TEXT PRIMARY KEY,
  ref_no TEXT DEFAULT '',
  "to" TEXT DEFAULT '',
  attn TEXT DEFAULT '',
  "from" TEXT DEFAULT '',
  date TEXT DEFAULT '',
  qty TEXT DEFAULT '',
  fab TEXT DEFAULT '',
  usage TEXT DEFAULT '',
  colors JSONB DEFAULT '[]',
  lights JSONB DEFAULT '[]',
  rm TEXT DEFAULT '',
  saved_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 授权
GRANT ALL PRIVILEGES ON TABLE color_notices TO anon;
GRANT ALL PRIVILEGES ON TABLE color_notices TO authenticated;
GRANT ALL PRIVILEGES ON TABLE color_notices TO service_role;

-- 关闭 RLS
ALTER TABLE color_notices DISABLE ROW LEVEL SECURITY;
