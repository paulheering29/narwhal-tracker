/**
 * Header matching.
 *
 * CentralReach exports are not consistent about casing, spacing, or trailing
 * punctuation in headers, and the same logical field can be named differently
 * between report types. Checks therefore refer to columns by a *logical* name
 * and let this module find the actual header.
 */

/** Strip BOM, trim, collapse inner whitespace, drop punctuation, lowercase. */
export function normalizeHeader(header) {
  return String(header ?? '')
    .replace(/^﻿/, '')
    .replace(/[_\-./\\()[\]{}#:]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

/**
 * Build a resolver over a set of actual file headers.
 *
 * @param {string[]} headers          Actual headers, in file order.
 * @param {Record<string, string[]>} [aliases]  logical name -> extra spellings.
 * @returns {{ resolve: (name: string) => (string|null), headers: string[] }}
 */
export function createColumnResolver(headers, aliases = {}) {
  const byNormalized = new Map();
  for (const header of headers) {
    const key = normalizeHeader(header);
    // First header wins, so a duplicate later in the file cannot shadow it.
    if (!byNormalized.has(key)) byNormalized.set(key, header);
  }

  const normalizedAliases = new Map();
  for (const [logical, spellings] of Object.entries(aliases)) {
    normalizedAliases.set(normalizeHeader(logical), spellings.map(normalizeHeader));
  }

  function resolve(name) {
    const key = normalizeHeader(name);
    if (byNormalized.has(key)) return byNormalized.get(key);
    for (const alias of normalizedAliases.get(key) ?? []) {
      if (byNormalized.has(alias)) return byNormalized.get(alias);
    }
    return null;
  }

  return { resolve, headers: [...headers] };
}

/** Find duplicate headers, which silently drop data during parsing. */
export function findDuplicateHeaders(headers) {
  const seen = new Map();
  const duplicates = [];
  for (const header of headers) {
    const key = normalizeHeader(header);
    if (seen.has(key)) duplicates.push(header);
    else seen.set(key, header);
  }
  return duplicates;
}
