import { redis } from '../db/redis';
import { config } from '../config';

// lua script to atomically check and increment rate limit counters.
// returns 1 if allowed, 0 if limit exceeded.
// this prevents race conditions when multiple workers run in parallel.
const checkAndIncrLua = `
local globalKey = KEYS[1]
local senderKey = KEYS[2]
local maxGlobal = tonumber(ARGV[1])
local maxSender = tonumber(ARGV[2])
local ttl = tonumber(ARGV[3])

local globalCount = tonumber(redis.call('GET', globalKey) or 0)
local senderCount = tonumber(redis.call('GET', senderKey) or 0)

if globalCount >= maxGlobal or senderCount >= maxSender then
  return 0
end

redis.call('INCR', globalKey)
redis.call('EXPIRE', globalKey, ttl)
redis.call('INCR', senderKey)
redis.call('EXPIRE', senderKey, ttl)
return 1
`;

function getHourWindow(): string {
  const now = new Date();
  return `${now.getUTCFullYear()}-${now.getUTCMonth()}-${now.getUTCDate()}-${now.getUTCHours()}`;
}

function getNextHourMs(): number {
  const now = new Date();
  const next = new Date(now);
  next.setUTCHours(next.getUTCHours() + 1, 0, 0, 0);
  return next.getTime() - now.getTime();
}

export async function tryAcquireRateLimit(senderEmail: string): Promise<{
  allowed: boolean;
  delayUntilNextWindowMs: number;
}> {
  const window = getHourWindow();
  const globalKey = `rate:global:${window}`;
  const senderKey = `rate:sender:${senderEmail}:${window}`;

  const result = await redis.eval(
    checkAndIncrLua,
    2,
    globalKey,
    senderKey,
    String(config.rateLimit.maxPerHour),
    String(config.rateLimit.maxPerHourPerSender),
    '3600'
  ) as number;

  if (result === 1) {
    return { allowed: true, delayUntilNextWindowMs: 0 };
  }

  return { allowed: false, delayUntilNextWindowMs: getNextHourMs() };
}

export async function getRateLimitStatus(): Promise<{
  globalCount: number;
  maxGlobal: number;
  windowKey: string;
}> {
  const window = getHourWindow();
  const globalKey = `rate:global:${window}`;
  const count = parseInt((await redis.get(globalKey)) || '0');
  return {
    globalCount: count,
    maxGlobal: config.rateLimit.maxPerHour,
    windowKey: window,
  };
}
