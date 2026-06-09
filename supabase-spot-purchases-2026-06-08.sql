-- 现货采购 + 布行档案（中大/轻纺城调货倒卖）
-- 老环境升级用：到 Supabase SQL Editor 粘贴运行一次即可（重复运行安全）

CREATE TABLE IF NOT EXISTS fabric_stalls (
  id TEXT PRIMARY KEY,
  nm TEXT DEFAULT '',
  loc TEXT DEFAULT '',
  ct TEXT DEFAULT '',
  ph TEXT DEFAULT '',
  rm TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS spot_purchases (
  id TEXT PRIMARY KEY,
  no TEXT DEFAULT '',
  date TEXT DEFAULT '',
  stall_id TEXT DEFAULT '',
  stall_nm TEXT DEFAULT '',
  ord_id TEXT DEFAULT '',
  ord_no TEXT DEFAULT '',
  mat_id TEXT DEFAULT '',
  fab TEXT DEFAULT '',
  unit TEXT DEFAULT 'kg',
  base_pr TEXT DEFAULT '',
  tube TEXT DEFAULT '',
  empty TEXT DEFAULT '',
  tax_incl BOOLEAN DEFAULT FALSE,
  paid BOOLEAN DEFAULT FALSE,
  colors JSONB DEFAULT '[]',
  total_amt NUMERIC DEFAULT 0,
  total_net NUMERIC DEFAULT 0,
  rm TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE fabric_stalls ENABLE ROW LEVEL SECURITY;
ALTER TABLE spot_purchases ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "允许已登录用户所有操作" ON fabric_stalls FOR ALL USING (auth.role() = 'authenticated');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY "允许已登录用户所有操作" ON spot_purchases FOR ALL USING (auth.role() = 'authenticated');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
