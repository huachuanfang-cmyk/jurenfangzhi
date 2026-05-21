export function normalizeSearchText(value) {
  return String(value ?? '')
    .replace(/[Ａ-Ｚａ-ｚ０-９]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) - 0xfee0))
    .toLowerCase()
    .replace(/[\s\-_/.#]+/g, '')
    .trim();
}

export function searchIncludes(haystack, query) {
  const h = normalizeSearchText(haystack);
  const q = normalizeSearchText(query);
  return !q || h.includes(q);
}

export function sameSearchCode(left, right) {
  const l = normalizeSearchText(left);
  const r = normalizeSearchText(right);
  return !!l && !!r && l === r;
}
