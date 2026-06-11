// Simple in-memory per-key rate limiter (Phase G7). Token-bucket style: each
// key gets `max` actions per `windowMs`; older timestamps slide out. Good
// enough to protect platform-key spend + auth abuse in a single-instance
// deployment. For multi-instance, swap for a Redis/DB-backed limiter.
//
// NOTE: in-memory state resets on redeploy and is per-process. That's an
// acceptable MVP tradeoff documented here.

interface Bucket {
  hits: number[];
}

const buckets = new Map<string, Bucket>();

export interface RateLimitResult {
  ok: boolean;
  remaining: number;
  retryAfterMs: number;
}

/**
 * Record an attempt for `key`. Returns ok=false when the key has used up its
 * allowance in the current sliding window.
 */
export function rateLimit(key: string, max: number, windowMs: number): RateLimitResult {
  const now = Date.now();
  const cutoff = now - windowMs;
  let bucket = buckets.get(key);
  if (!bucket) {
    bucket = { hits: [] };
    buckets.set(key, bucket);
  }
  // Drop timestamps outside the window.
  bucket.hits = bucket.hits.filter((t) => t > cutoff);

  if (bucket.hits.length >= max) {
    const oldest = bucket.hits[0]!;
    return { ok: false, remaining: 0, retryAfterMs: oldest + windowMs - now };
  }

  bucket.hits.push(now);
  return { ok: true, remaining: max - bucket.hits.length, retryAfterMs: 0 };
}

/** Occasionally clear fully-expired buckets so the map doesn't grow forever. */
export function sweepRateLimiter(windowMs: number): void {
  const cutoff = Date.now() - windowMs;
  for (const [key, bucket] of buckets) {
    if (bucket.hits.every((t) => t <= cutoff)) buckets.delete(key);
  }
}
