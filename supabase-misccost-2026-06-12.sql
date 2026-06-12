-- 作业成本法：各环节杂费记在对应单据上（运费/包装费/纸筒费等）
-- 加工跟踪/纱线采购/胚布采购/现货采购 各加 misc_cost(金额) + misc_rm(说明)
-- 老环境升级用：到 Supabase SQL Editor 粘贴运行一次即可（重复运行安全）
-- 未运行前 misc_cost/misc_rm 仅存本机，同步会自动剥离缺失列，不影响其他数据

ALTER TABLE trackings      ADD COLUMN IF NOT EXISTS misc_cost TEXT DEFAULT '';
ALTER TABLE trackings      ADD COLUMN IF NOT EXISTS misc_rm   TEXT DEFAULT '';
ALTER TABLE yarns          ADD COLUMN IF NOT EXISTS misc_cost TEXT DEFAULT '';
ALTER TABLE yarns          ADD COLUMN IF NOT EXISTS misc_rm   TEXT DEFAULT '';
ALTER TABLE grey_fabrics   ADD COLUMN IF NOT EXISTS misc_cost TEXT DEFAULT '';
ALTER TABLE grey_fabrics   ADD COLUMN IF NOT EXISTS misc_rm   TEXT DEFAULT '';
ALTER TABLE spot_purchases ADD COLUMN IF NOT EXISTS misc_cost TEXT DEFAULT '';
ALTER TABLE spot_purchases ADD COLUMN IF NOT EXISTS misc_rm   TEXT DEFAULT '';
