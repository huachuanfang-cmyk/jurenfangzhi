import { normalizeSearchText, searchIncludes } from './search-core.mjs';

export function materialCode(material) {
  return String(
    material?.mid ??
    material?.prodNo ??
    material?.prod_no ??
    material?.materialNo ??
    material?.material_no ??
    material?.code ??
    material?.no ??
    ''
  );
}

export function materialSearchText(material) {
  const comps = Array.isArray(material?.comps)
    ? material.comps.map((c) => `${c?.nm ?? ''} ${c?.pct ?? ''}`).join(' ')
    : (material?.comp ?? material?.comps ?? '');

  return [
    materialCode(material),
    material?.fab,
    material?.alias,
    material?.origCo,
    material?.orig_co,
    material?.origNo,
    material?.orig_no,
    material?.contact,
    material?.weaver,
    material?.dyer,
    comps,
  ].join(' ');
}

export function materialMatches(material, query) {
  return searchIncludes(materialSearchText(material), query);
}

export function mergeMaterialResults(localMaterials, remoteMaterials, query) {
  const seen = new Set();
  const out = [];
  const add = (material) => {
    if (!materialMatches(material, query)) return;
    const key = normalizeSearchText(materialCode(material)) || String(material?.id ?? '');
    if (key && seen.has(key)) return;
    if (key) seen.add(key);
    out.push(material);
  };
  localMaterials.forEach(add);
  remoteMaterials.forEach(add);
  return out;
}
