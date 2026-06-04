-- ============================================================
-- 巨人纺织ERP - Supabase 数据库建表脚本
-- 在 Supabase SQL Editor 中运行此脚本
-- ============================================================

-- 1. 客户档案
CREATE TABLE customers (
  id TEXT PRIMARY KEY,
  nm TEXT NOT NULL,
  ct TEXT DEFAULT '',
  ph TEXT DEFAULT '',
  wx TEXT DEFAULT '',
  tp TEXT DEFAULT '内贸',
  tm TEXT DEFAULT '30',
  pm TEXT DEFAULT '',
  cpd TEXT DEFAULT '完整布类',
  ad TEXT DEFAULT '',
  rm TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. 加工厂档案
CREATE TABLE factories (
  id TEXT PRIMARY KEY,
  nm TEXT NOT NULL,
  ct TEXT DEFAULT '',
  ph TEXT DEFAULT '',
  wx TEXT DEFAULT '',
  prcs JSONB DEFAULT '[]',
  st TEXT DEFAULT '月结',
  cr INTEGER DEFAULT 3,
  ad TEXT DEFAULT '',
  rm TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. 物料档案
CREATE TABLE materials (
  id TEXT PRIMARY KEY,
  mid TEXT DEFAULT '',
  fab TEXT DEFAULT '',
  alias TEXT DEFAULT '',
  width TEXT DEFAULT '',
  width_unit TEXT DEFAULT 'cm',
  gsm TEXT DEFAULT '',
  comps JSONB DEFAULT '[]',
  price TEXT DEFAULT '',
  orig_price TEXT DEFAULT '',
  src TEXT DEFAULT '',
  orig_co TEXT DEFAULT '',
  orig_no TEXT DEFAULT '',
  contact TEXT DEFAULT '',
  addr TEXT DEFAULT '',
  tube_wt TEXT DEFAULT '',
  weaver TEXT DEFAULT '',
  dyer TEXT DEFAULT '',
  empty_diff TEXT DEFAULT '',
  remark TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  status TEXT DEFAULT 'confirmed'
);

-- 4. 销售订单
CREATE TABLE orders (
  id TEXT PRIMARY KEY,
  no TEXT DEFAULT '',
  prod_no TEXT DEFAULT '',
  cust_no TEXT DEFAULT '',
  sty TEXT DEFAULT '',
  follower TEXT DEFAULT '',
  ord_date TEXT DEFAULT '',
  cust_nm TEXT DEFAULT '',
  fab TEXT DEFAULT '',
  fab_b TEXT DEFAULT '',
  comps JSONB DEFAULT '[]',
  gauge_n TEXT DEFAULT '',
  gauge_s TEXT DEFAULT '',
  width TEXT DEFAULT '',
  width_unit TEXT DEFAULT 'cm',
  weight TEXT DEFAULT '',
  shrink TEXT DEFAULT '',
  del_date TEXT DEFAULT '',
  unit_pr TEXT DEFAULT '',
  pr_unit TEXT DEFAULT '元/KG',
  tax_type TEXT DEFAULT 'incl',
  pay_tm TEXT DEFAULT '',
  status TEXT DEFAULT 'draft',
  paid BOOLEAN DEFAULT FALSE,
  rm TEXT DEFAULT '',
  cpnm TEXT DEFAULT '',
  colors JSONB DEFAULT '[]',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 5. 加工跟踪
CREATE TABLE trackings (
  id TEXT PRIMARY KEY,
  ord_id TEXT DEFAULT '',
  ord_no TEXT DEFAULT '',
  clr_nm TEXT DEFAULT '',
  clr_code TEXT DEFAULT '',
  yb TEXT DEFAULT '',
  proc TEXT DEFAULT '',
  fact_nm TEXT DEFAULT '',
  mach_no TEXT DEFAULT '',
  vat_no TEXT DEFAULT '',
  vat_wt TEXT DEFAULT '',
  status TEXT DEFAULT 'pending',
  sent_q NUMERIC DEFAULT 0,
  ret_q TEXT DEFAULT '',
  act_w TEXT DEFAULT '',
  unit_pr NUMERIC DEFAULT 0,
  fee TEXT DEFAULT '',
  f_paid BOOLEAN DEFAULT FALSE,
  est_d TEXT DEFAULT '',
  act_d TEXT DEFAULT '',
  rm TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 6. 纱线采购
CREATE TABLE yarns (
  id TEXT PRIMARY KEY,
  po_no TEXT DEFAULT '',
  ord_id TEXT DEFAULT '',
  ord_no TEXT DEFAULT '',
  supplier TEXT NOT NULL,
  spec TEXT NOT NULL,
  brand TEXT DEFAULT '',
  color TEXT DEFAULT '',
  color_code TEXT DEFAULT '',
  batch_no TEXT DEFAULT '',
  ord_kg TEXT DEFAULT '',
  cones TEXT DEFAULT '',
  unit_pr TEXT DEFAULT '',
  amt TEXT DEFAULT '',
  ord_date TEXT DEFAULT '',
  del_date TEXT DEFAULT '',
  arr_date TEXT DEFAULT '',
  act_kg TEXT DEFAULT '',
  paid BOOLEAN DEFAULT FALSE,
  rm TEXT DEFAULT '',
  del_fac_id TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 7. 发料/回仓
CREATE TABLE yarn_issues (
  id TEXT PRIMARY KEY,
  type TEXT DEFAULT '',
  fr_no TEXT DEFAULT '',
  yarn_id TEXT DEFAULT '',
  spec TEXT DEFAULT '',
  batch_no TEXT DEFAULT '',
  factory TEXT DEFAULT '',
  ord_no TEXT DEFAULT '',
  kg NUMERIC DEFAULT 0,
  date TEXT DEFAULT '',
  rm TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 8. 胚布采购
CREATE TABLE grey_fabrics (
  id TEXT PRIMARY KEY,
  contract_no TEXT DEFAULT '',
  ord_id TEXT DEFAULT '',
  ord_no TEXT DEFAULT '',
  supplier TEXT DEFAULT '',
  sup_ct TEXT DEFAULT '',
  sup_ph TEXT DEFAULT '',
  fab TEXT DEFAULT '',
  gauge_n TEXT DEFAULT '',
  gauge_s TEXT DEFAULT '',
  width TEXT DEFAULT '',
  weight TEXT DEFAULT '',
  ord_date TEXT DEFAULT '',
  del_date TEXT DEFAULT '',
  colors JSONB DEFAULT '[]',
  total_kg TEXT DEFAULT '',
  total_amt TEXT DEFAULT '',
  rm TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 9. 成品入库
CREATE TABLE fg_ins (
  id TEXT PRIMARY KEY,
  no TEXT DEFAULT '',
  ord_id TEXT DEFAULT '',
  ord_no TEXT DEFAULT '',
  cust_nm TEXT DEFAULT '',
  color_nm TEXT DEFAULT '',
  color_code TEXT DEFAULT '',
  vat_no TEXT DEFAULT '',
  kg TEXT DEFAULT '',
  date TEXT DEFAULT '',
  src_nm TEXT DEFAULT '',
  wv_fac TEXT DEFAULT '',
  roll_count INTEGER DEFAULT 0,
  status TEXT DEFAULT '',
  void_reason TEXT DEFAULT '',
  voided_at TEXT DEFAULT '',
  rm TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 10. 成品出货
CREATE TABLE fg_outs (
  id TEXT PRIMARY KEY,
  no TEXT DEFAULT '',
  date TEXT DEFAULT '',
  ord_id TEXT DEFAULT '',
  ord_no TEXT DEFAULT '',
  cust_nm TEXT DEFAULT '',
  dlv_no TEXT DEFAULT '',
  cust_ord_no TEXT DEFAULT '',
  cust_no TEXT DEFAULT '',
  approx_m TEXT DEFAULT '',
  fee_nm TEXT DEFAULT '',
  fee_amt TEXT DEFAULT '',
  is_quick BOOLEAN DEFAULT FALSE,
  fab TEXT DEFAULT '',
  clr TEXT DEFAULT '',
  color_nm TEXT DEFAULT '',
  lot TEXT DEFAULT '',
  width TEXT DEFAULT '',
  gsm TEXT DEFAULT '',
  pr_unit TEXT DEFAULT '',
  unit_pr TEXT DEFAULT '',
  pcs_data JSONB DEFAULT '[]',
  rm TEXT DEFAULT '',
  roll_ids JSONB DEFAULT '[]',
  voided TEXT DEFAULT '',
  arec_id TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 11. 布卷记录
CREATE TABLE fg_rolls (
  id TEXT PRIMARY KEY,
  in_id TEXT DEFAULT '',
  ord_id TEXT DEFAULT '',
  ord_no TEXT DEFAULT '',
  cust_nm TEXT DEFAULT '',
  fab TEXT DEFAULT '',
  color_nm TEXT DEFAULT '',
  color_code TEXT DEFAULT '',
  vat_no TEXT DEFAULT '',
  wv_fac TEXT DEFAULT '',
  roll_no TEXT DEFAULT '',
  kg TEXT DEFAULT '',
  m TEXT DEFAULT '',
  rm TEXT DEFAULT '',
  status TEXT DEFAULT 'in',
  out_id TEXT DEFAULT '',
  grade TEXT DEFAULT '',
  returned BOOLEAN DEFAULT FALSE,
  ret_id TEXT DEFAULT '',
  resolved_at TEXT DEFAULT '',
  repair_note TEXT DEFAULT '',
  void_reason TEXT DEFAULT '',
  voided_at TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 12. 成品退货
CREATE TABLE fg_returns (
  id TEXT PRIMARY KEY,
  no TEXT DEFAULT '',
  date TEXT DEFAULT '',
  out_id TEXT DEFAULT '',
  out_no TEXT DEFAULT '',
  ord_id TEXT DEFAULT '',
  ord_no TEXT DEFAULT '',
  cust_nm TEXT DEFAULT '',
  reason TEXT DEFAULT '',
  roll_ids JSONB DEFAULT '[]',
  total_kg NUMERIC DEFAULT 0,
  deduct_kg NUMERIC DEFAULT 0,
  status TEXT DEFAULT 'pending',
  resolved_at TEXT DEFAULT '',
  repair_note TEXT DEFAULT '',
  rm TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 13. 打办通知单
CREATE TABLE color_notices (
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

-- 14. 报价单
CREATE TABLE quotations (
  id TEXT PRIMARY KEY,
  no TEXT DEFAULT '',
  cust_nm TEXT NOT NULL,
  contact TEXT DEFAULT '',
  date TEXT DEFAULT '',
  valid_to TEXT DEFAULT '',
  items JSONB DEFAULT '[]',
  terms JSONB DEFAULT '[]',
  show_meter BOOLEAN DEFAULT FALSE,
  moq_note TEXT DEFAULT '',
  rm TEXT DEFAULT '',
  created_date TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 15. 应收对账
CREATE TABLE ar_records (
  id TEXT PRIMARY KEY,
  no TEXT DEFAULT '',
  cust_nm TEXT NOT NULL,
  month TEXT DEFAULT '',
  pay_type TEXT DEFAULT '',
  due_date TEXT DEFAULT '',
  out_ids JSONB DEFAULT '[]',
  ret_ids JSONB DEFAULT '[]',
  total_amt TEXT DEFAULT '',
  ship_fee_total TEXT DEFAULT '',
  return_total TEXT DEFAULT '',
  adjustments JSONB DEFAULT '[]',
  deduct_total TEXT DEFAULT '',
  add_total TEXT DEFAULT '',
  payments JSONB DEFAULT '[]',
  paid_total TEXT DEFAULT '',
  balance_amt TEXT DEFAULT '',
  status TEXT DEFAULT 'pending',
  created_date TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 16. 应付对账
CREATE TABLE ap_records (
  id TEXT PRIMARY KEY,
  no TEXT DEFAULT '',
  fact_nm TEXT NOT NULL,
  fact_type TEXT DEFAULT '',
  month TEXT DEFAULT '',
  bill_date TEXT DEFAULT '',
  orders TEXT DEFAULT '',
  total_pcs TEXT DEFAULT '',
  total_kg TEXT DEFAULT '',
  bill_amt TEXT DEFAULT '',
  deducts JSONB DEFAULT '[]',
  deduct_total TEXT DEFAULT '',
  actual_amt TEXT DEFAULT '',
  rm TEXT DEFAULT '',
  status TEXT DEFAULT 'pending',
  created_date TEXT DEFAULT '',
  paid_date TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 17. 织厂加工单配置
CREATE TABLE weaving_docs (
  id SERIAL PRIMARY KEY,
  ord_id TEXT NOT NULL,
  fac_nm TEXT DEFAULT '',
  ct TEXT DEFAULT '',
  due TEXT DEFAULT '',
  pr TEXT DEFAULT '',
  tax_type TEXT DEFAULT '',
  ls TEXT DEFAULT '',
  yq TEXT DEFAULT '',
  gauge_n TEXT DEFAULT '',
  gauge_s TEXT DEFAULT '',
  spec_wd TEXT DEFAULT '',
  spec_wu TEXT DEFAULT 'cm',
  spec_wt TEXT DEFAULT '',
  shrink TEXT DEFAULT '',
  ra TEXT DEFAULT '',
  ra_nm TEXT DEFAULT '',
  ra_ct TEXT DEFAULT '',
  ra_ph TEXT DEFAULT '',
  ra_sel_nm TEXT DEFAULT '',
  note TEXT DEFAULT '',
  rm TEXT DEFAULT '',
  status TEXT DEFAULT 'draft',
  issued_at TEXT DEFAULT '',
  unlock_reason TEXT DEFAULT '',
  selected_colors JSONB DEFAULT '[]',
  color_kg_map JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(ord_id)
);

-- 18. 染整加工单配置
CREATE TABLE dyeing_docs (
  id SERIAL PRIMARY KEY,
  ord_id TEXT NOT NULL,
  fac_nm TEXT DEFAULT '',
  ct TEXT DEFAULT '',
  ph TEXT DEFAULT '',
  due TEXT DEFAULT '',
  wb TEXT DEFAULT '',
  ra TEXT DEFAULT '',
  rct TEXT DEFAULT '',
  rph TEXT DEFAULT '',
  da TEXT DEFAULT '',
  dc TEXT DEFAULT '',
  dp TEXT DEFAULT '',
  sw TEXT DEFAULT '',
  sl TEXT DEFAULT '',
  sn TEXT DEFAULT '',
  sk TEXT DEFAULT '',
  sm TEXT DEFAULT '',
  spec_wd TEXT DEFAULT '',
  spec_wu TEXT DEFAULT 'cm',
  spec_wt TEXT DEFAULT '',
  pj TEXT DEFAULT '',
  rm TEXT DEFAULT '',
  pkg JSONB DEFAULT '[]',
  proc_order JSONB DEFAULT '[]',
  vat_rm JSONB DEFAULT '[]',
  vat_code JSONB DEFAULT '[]',
  vat_q1 JSONB DEFAULT '[]',
  pj_note TEXT DEFAULT '',
  status TEXT DEFAULT 'draft',
  issued_at TEXT DEFAULT '',
  unlock_reason TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(ord_id)
);

-- 19. 删除墓碑：防止多端同步时已删除记录从云端回弹
CREATE TABLE tombstones (
  id TEXT PRIMARY KEY,
  biz_key TEXT NOT NULL,
  record_id TEXT NOT NULL,
  table_name TEXT DEFAULT '',
  deleted_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- 启用行级安全（RLS）
-- ============================================================
ALTER TABLE customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE factories ENABLE ROW LEVEL SECURITY;
ALTER TABLE materials ENABLE ROW LEVEL SECURITY;
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE trackings ENABLE ROW LEVEL SECURITY;
ALTER TABLE yarns ENABLE ROW LEVEL SECURITY;
ALTER TABLE yarn_issues ENABLE ROW LEVEL SECURITY;
ALTER TABLE grey_fabrics ENABLE ROW LEVEL SECURITY;
ALTER TABLE fg_ins ENABLE ROW LEVEL SECURITY;
ALTER TABLE fg_outs ENABLE ROW LEVEL SECURITY;
ALTER TABLE fg_rolls ENABLE ROW LEVEL SECURITY;
ALTER TABLE fg_returns ENABLE ROW LEVEL SECURITY;
ALTER TABLE color_notices ENABLE ROW LEVEL SECURITY;
ALTER TABLE quotations ENABLE ROW LEVEL SECURITY;
ALTER TABLE ar_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE ap_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE weaving_docs ENABLE ROW LEVEL SECURITY;
ALTER TABLE dyeing_docs ENABLE ROW LEVEL SECURITY;
ALTER TABLE tombstones ENABLE ROW LEVEL SECURITY;

-- 允许已登录用户读写所有表
CREATE POLICY "允许已登录用户所有操作" ON customers FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "允许已登录用户所有操作" ON factories FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "允许已登录用户所有操作" ON materials FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "允许已登录用户所有操作" ON orders FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "允许已登录用户所有操作" ON trackings FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "允许已登录用户所有操作" ON yarns FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "允许已登录用户所有操作" ON yarn_issues FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "允许已登录用户所有操作" ON grey_fabrics FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "允许已登录用户所有操作" ON fg_ins FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "允许已登录用户所有操作" ON fg_outs FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "允许已登录用户所有操作" ON fg_rolls FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "允许已登录用户所有操作" ON fg_returns FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "允许已登录用户所有操作" ON color_notices FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "允许已登录用户所有操作" ON quotations FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "允许已登录用户所有操作" ON ar_records FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "允许已登录用户所有操作" ON ap_records FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "允许已登录用户所有操作" ON weaving_docs FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "允许已登录用户所有操作" ON dyeing_docs FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "允许已登录用户所有操作" ON tombstones FOR ALL USING (auth.role() = 'authenticated');

-- Supabase Data API 表权限（RLS 控制行权限，GRANT 控制表是否可访问）
GRANT USAGE ON SCHEMA public TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO authenticated;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO authenticated;

-- ============================================================
-- 创建索引（常用查询字段）
-- ============================================================
CREATE INDEX idx_orders_no ON orders(no);
CREATE INDEX idx_orders_cust_nm ON orders(cust_nm);
CREATE INDEX idx_orders_status ON orders(status);
CREATE INDEX idx_trackings_ord_id ON trackings(ord_id);
CREATE INDEX idx_fg_rolls_ord_id ON fg_rolls(ord_id);
CREATE INDEX idx_fg_rolls_status ON fg_rolls(status);
CREATE INDEX idx_fg_returns_out_id ON fg_returns(out_id);
CREATE INDEX idx_fg_returns_status ON fg_returns(status);
CREATE INDEX idx_fg_ins_ord_id ON fg_ins(ord_id);
CREATE INDEX idx_fg_outs_ord_id ON fg_outs(ord_id);
CREATE INDEX idx_quotations_cust_nm ON quotations(cust_nm);
CREATE INDEX idx_customers_nm ON customers(nm);
CREATE INDEX idx_materials_mid ON materials(mid);
CREATE INDEX idx_tombstones_biz_record ON tombstones(biz_key, record_id);
