// src/lib/redis.ts
// Used for idempotency-key caching.
// Upstash Redis works with the @upstash/redis client via HTTP — no persistent TCP
// connection is needed, which suits serverless runtimes well.

import { Redis } from "@upstash/redis";

// If UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN are not set,
// we fall back to a no-op stub so the app still works without Redis
// (idempotency simply won't be enforced).
let redis: Redis | null = null;

if (
  process.env.UPSTASH_REDIS_REST_URL &&
  process.env.UPSTASH_REDIS_REST_TOKEN
) {
  redis = new Redis({
    url: process.env.UPSTASH_REDIS_REST_URL,
    token: process.env.UPSTASH_REDIS_REST_TOKEN,
  });
}

export { redis };

// TTL for idempotency keys — 24 hours is conventional.
const IDEMPOTENCY_TTL_SECONDS = 86_400;

/**
 * Attempts to store an idempotency key with the given response payload.
 * Returns the cached payload if the key already exists, or null if it was
 * freshly stored (meaning the request is new).
 */
export async function checkIdempotency(
  key: string,
  namespace: string
): Promise<unknown | null> {
  if (!redis) return null;
  const redisKey = `idempotency:${namespace}:${key}`;
  const cached = await redis.get(redisKey);
  return cached ?? null;
}

export async function storeIdempotency(
  key: string,
  namespace: string,
  payload: unknown
): Promise<void> {
  if (!redis) return;
  const redisKey = `idempotency:${namespace}:${key}`;
  await redis.set(redisKey, JSON.stringify(payload), {
    ex: IDEMPOTENCY_TTL_SECONDS,
  });
}
