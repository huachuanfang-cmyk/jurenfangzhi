-- 加工单下达版本留痕（P2）：解锁时把"已下达的那一版"原样存入 revisions
-- 老环境升级用：到 Supabase SQL Editor 粘贴运行一次即可（重复运行安全）
-- 注：未运行前 revisions 仅存本机（同步会自动剥离缺失列，不影响其他数据）

ALTER TABLE weaving_docs ADD COLUMN IF NOT EXISTS revisions JSONB DEFAULT '[]';
ALTER TABLE dyeing_docs  ADD COLUMN IF NOT EXISTS revisions JSONB DEFAULT '[]';

-- 数量联动(A方案)：记录每个颜色的落缸数/KG是否被"手动改过"，手动则不再跟随销售订单
ALTER TABLE weaving_docs ADD COLUMN IF NOT EXISTS color_kg_manual_map JSONB DEFAULT '{}';
ALTER TABLE dyeing_docs  ADD COLUMN IF NOT EXISTS vat_q1_manual       JSONB DEFAULT '[]';
