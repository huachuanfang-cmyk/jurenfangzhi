-- ============================================================
-- 巨人纺织ERP - Supabase 同步修复脚本（2026-05-25）
-- 用途：
-- 1. 补齐前端近期新增字段，避免 PostgREST 报 schema cache column not found
-- 2. 授予 authenticated 角色表权限，避免 permission denied for table
-- 3. 不删除任何数据，可重复执行
-- ============================================================

CREATE TABLE IF NOT EXISTS public.fg_returns (
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

ALTER TABLE public.fg_ins
  ADD COLUMN IF NOT EXISTS color_code TEXT DEFAULT '',
  ADD COLUMN IF NOT EXISTS wv_fac TEXT DEFAULT '',
  ADD COLUMN IF NOT EXISTS roll_count INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS status TEXT DEFAULT '',
  ADD COLUMN IF NOT EXISTS void_reason TEXT DEFAULT '',
  ADD COLUMN IF NOT EXISTS voided_at TEXT DEFAULT '';

ALTER TABLE public.fg_rolls
  ADD COLUMN IF NOT EXISTS fab TEXT DEFAULT '',
  ADD COLUMN IF NOT EXISTS color_code TEXT DEFAULT '',
  ADD COLUMN IF NOT EXISTS wv_fac TEXT DEFAULT '',
  ADD COLUMN IF NOT EXISTS resolved_at TEXT DEFAULT '',
  ADD COLUMN IF NOT EXISTS grade TEXT DEFAULT '',
  ADD COLUMN IF NOT EXISTS returned BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS ret_id TEXT DEFAULT '',
  ADD COLUMN IF NOT EXISTS repair_note TEXT DEFAULT '',
  ADD COLUMN IF NOT EXISTS void_reason TEXT DEFAULT '',
  ADD COLUMN IF NOT EXISTS voided_at TEXT DEFAULT '';

ALTER TABLE public.fg_outs
  ADD COLUMN IF NOT EXISTS cust_ord_no TEXT DEFAULT '',
  ADD COLUMN IF NOT EXISTS cust_no TEXT DEFAULT '',
  ADD COLUMN IF NOT EXISTS approx_m TEXT DEFAULT '',
  ADD COLUMN IF NOT EXISTS fee_nm TEXT DEFAULT '',
  ADD COLUMN IF NOT EXISTS fee_amt TEXT DEFAULT '',
  ADD COLUMN IF NOT EXISTS is_quick BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS fab TEXT DEFAULT '',
  ADD COLUMN IF NOT EXISTS clr TEXT DEFAULT '',
  ADD COLUMN IF NOT EXISTS color_nm TEXT DEFAULT '',
  ADD COLUMN IF NOT EXISTS lot TEXT DEFAULT '',
  ADD COLUMN IF NOT EXISTS width TEXT DEFAULT '',
  ADD COLUMN IF NOT EXISTS gsm TEXT DEFAULT '',
  ADD COLUMN IF NOT EXISTS pr_unit TEXT DEFAULT '',
  ADD COLUMN IF NOT EXISTS unit_pr TEXT DEFAULT '',
  ADD COLUMN IF NOT EXISTS pcs_data JSONB DEFAULT '[]';

ALTER TABLE public.fg_returns
  ADD COLUMN IF NOT EXISTS resolved_at TEXT DEFAULT '',
  ADD COLUMN IF NOT EXISTS repair_note TEXT DEFAULT '',
  ADD COLUMN IF NOT EXISTS deduct_kg NUMERIC DEFAULT 0;

ALTER TABLE public.ar_records
  ADD COLUMN IF NOT EXISTS ret_ids JSONB DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS ship_fee_total TEXT DEFAULT '',
  ADD COLUMN IF NOT EXISTS return_total TEXT DEFAULT '';

-- Data API 权限。RLS 决定“能看哪些行”，GRANT 决定“能不能访问这张表”。
GRANT USAGE ON SCHEMA public TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO authenticated;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO authenticated;

-- 确保关键表 RLS 已开启，并有登录用户可读写策略。
DO $$
DECLARE
  tbl text;
BEGIN
  FOREACH tbl IN ARRAY ARRAY[
    'customers','factories','materials','orders','trackings','yarns',
    'yarn_issues','grey_fabrics','fg_ins','fg_outs','fg_rolls',
    'fg_returns','color_notices','quotations','ar_records','ap_records',
    'weaving_docs','dyeing_docs'
  ]
  LOOP
    IF to_regclass(format('public.%I', tbl)) IS NULL THEN
      CONTINUE;
    END IF;

    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', tbl);
    IF NOT EXISTS (
      SELECT 1
      FROM pg_policies
      WHERE schemaname = 'public'
        AND tablename = tbl
        AND policyname = '允许已登录用户所有操作'
    ) THEN
      EXECUTE format(
        'CREATE POLICY "允许已登录用户所有操作" ON public.%I FOR ALL TO authenticated USING (auth.role() = ''authenticated'') WITH CHECK (auth.role() = ''authenticated'')',
        tbl
      );
    END IF;
  END LOOP;
END $$;

NOTIFY pgrst, 'reload schema';
