/**
 * Display-time deduplication for entity lists (contacts, accounts, items, etc.).
 * Does not change persistence — only cleans what the UI renders.
 */

export function normalizeEntityName(name: string): string {
  return name
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase();
}

export type DedupeEntitiesForDisplayOptions<T extends Record<string, unknown>> = {
  idKey: keyof T & string;
  /** Used for secondary dedupe: same normalized name collapses to one row (first wins). */
  nameKey?: keyof T & string;
  /**
   * When set, name collisions are only merged within the same scope value
   * (e.g. contact `type` so customer "Acme" ≠ vendor "Acme").
   */
  scopeKey?: keyof T & string;
  /** Label for dev logs (e.g. "contact", "account"). */
  entityLabel?: string;
};

function logDedupe(
  label: string,
  inputLen: number,
  outputLen: number,
  duplicateIds: string[],
  duplicateScopedNames: string[],
) {
  if (process.env.NODE_ENV !== "development") return;
  if (duplicateIds.length === 0 && duplicateScopedNames.length === 0) return;
  console.debug(`[entity-dedupe] ${label}`, {
    inputCount: inputLen,
    outputCount: outputLen,
    droppedDuplicateIds: duplicateIds,
    droppedDuplicateNormalizedNames: duplicateScopedNames,
  });
}

/**
 * - Drops duplicate rows with the same id (API/join bugs).
 * - Optionally drops rows that share the same normalized name within optional scope
 *   (e.g. two "Apple" vendor rows with different ids → one row kept).
 */
export function dedupeEntitiesForDisplay<T extends Record<string, unknown>>(
  records: T[],
  options: DedupeEntitiesForDisplayOptions<T>,
): T[] {
  const { idKey, nameKey, scopeKey, entityLabel = "entity" } = options;
  const seenIds = new Set<string>();
  const seenScopedNames = new Set<string>();
  const out: T[] = [];
  const dupIds: string[] = [];
  const dupNames: string[] = [];

  for (const r of records) {
    const rawId = r[idKey];
    const id = rawId != null && rawId !== "" ? String(rawId) : "";
    if (id) {
      if (seenIds.has(id)) {
        dupIds.push(id);
        continue;
      }
      seenIds.add(id);
    }

    if (nameKey) {
      const rawName = r[nameKey];
      const n =
        typeof rawName === "string" && rawName.length > 0 ? normalizeEntityName(rawName) : "";
      if (n) {
        const scope =
          scopeKey && r[scopeKey] != null && r[scopeKey] !== ""
            ? String(r[scopeKey])
            : "";
        const scoped = `${scope}::${n}`;
        if (seenScopedNames.has(scoped)) {
          dupNames.push(`${scope || "(no scope)"}: ${String(rawName)}`);
          continue;
        }
        seenScopedNames.add(scoped);
      }
    }

    out.push(r);
  }

  logDedupe(entityLabel, records.length, out.length, dupIds, dupNames);
  return out;
}
