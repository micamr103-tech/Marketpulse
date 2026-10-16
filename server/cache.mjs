/**
 * Tiny TTL cache with stale-while-revalidate semantics.
 * Keeps the app feeling instant on repeat visits while staying fresh.
 */
const store = new Map();

/** Attach cache metadata without destroying the shape (arrays stay arrays). */
function withMeta(value, meta) {
  return Array.isArray(value)
    ? Object.assign([...value], meta)
    : { ...value, ...meta };
}

export function cached(key, ttlMs, producer) {
  const hit = store.get(key);
  const now = Date.now();

  if (hit && now - hit.at < ttlMs) {
    return Promise.resolve(withMeta(hit.value, { _cache: "hit", _ageMs: now - hit.at }));
  }

  if (hit) {
    // Serve stale immediately, refresh in the background.
    refresh(key, ttlMs, producer);
    return Promise.resolve(withMeta(hit.value, { _cache: "stale", _ageMs: now - hit.at }));
  }

  return refresh(key, ttlMs, producer, true);
}

function refresh(key, ttlMs, producer, wait = false) {
  const run = async () => {
    try {
      const value = await producer();
      store.set(key, { value, at: Date.now() });
      return withMeta(value, { _cache: "miss" });
    } catch (err) {
      const prev = store.get(key);
      if (prev) return withMeta(prev.value, { _cache: "error-stale" });
      throw err;
    }
  };

  if (!wait) {
    run().catch(() => {});
    return Promise.resolve(null);
  }
  return run();
}

export function invalidate(prefix) {
  for (const key of store.keys()) if (key.startsWith(prefix)) store.delete(key);
}

export const TTL = {
  quote: 15_000,
  candles: 60_000,
  news: 5 * 60_000,
  analysis: 10 * 60_000,
  quotes: 30_000,
};