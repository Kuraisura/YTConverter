import { createHmac } from 'node:crypto';
import type { NextRequest } from 'next/server';
import { Redis } from '@upstash/redis';

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL || '',
  token: process.env.UPSTASH_REDIS_REST_TOKEN || '',
});

const REQUEST_LIMIT = Math.max(1, Number(process.env.CONVERSION_RATE_LIMIT) || 5);
const WINDOW_SECONDS = Math.max(60, Number(process.env.CONVERSION_RATE_WINDOW_SEC) || 600);

function getClientAddress(request: NextRequest): string {
  const forwarded = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim();
  return request.headers.get('cf-connecting-ip') || request.headers.get('x-real-ip') || forwarded || 'unknown';
}

export function getAnonymousClientId(request: NextRequest): string {
  const secret = process.env.RATE_LIMIT_SECRET
    || process.env.CLEANUP_CRON_TOKEN
    || process.env.UPSTASH_REDIS_REST_TOKEN
    || 'local-development-only';

  return createHmac('sha256', secret).update(getClientAddress(request)).digest('hex').slice(0, 32);
}

export async function checkConversionRateLimit(clientId: string): Promise<{
  allowed: boolean;
  remaining: number;
  retryAfter: number;
}> {
  const bucket = Math.floor(Date.now() / (WINDOW_SECONDS * 1000));
  const key = `rate:convert:${clientId}:${bucket}`;
  const count = await redis.eval<number>(
    `local count = redis.call('INCR', KEYS[1])
     if count == 1 then redis.call('EXPIRE', KEYS[1], ARGV[1]) end
     return count`,
    [key],
    [WINDOW_SECONDS.toString()],
  );

  return {
    allowed: count <= REQUEST_LIMIT,
    remaining: Math.max(0, REQUEST_LIMIT - count),
    retryAfter: Math.max(1, await redis.ttl(key)),
  };
}
