const TTL_MS = 60_000;
type Entry<T> = { value: T; createdAt: number };
const g = globalThis as unknown as { __reportsCache?: Map<string, Entry<unknown>> };

function cacheMap(): Map<string, Entry<unknown>> {
  if (!g.__reportsCache) g.__reportsCache = new Map();
  return g.__reportsCache;
}

function key(parts: [string, ...string[]]) {
  return parts.join("::");
}

/**
 * In-memory 60s cache (per process). For Stage 10, invalidate on journal post or wire Redis.
 */
export async function getCachedReport<T>(
  parts: [string, ...string[]],
  factory: () => Promise<T>,
): Promise<T> {
  const m = cacheMap();
  const k = key(parts);
  const now = Date.now();
  const hit = m.get(k) as Entry<T> | undefined;
  if (hit && now - hit.createdAt < TTL_MS) {
    return hit.value;
  }
  const value = await factory();
  m.set(k, { value, createdAt: Date.now() } as Entry<unknown>);
  return value;
}
