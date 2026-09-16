// Implements the hourly send-rate limiting used before an email is actually
// dispatched. Enforces a global cap, a per-sender cap, and an optional
// per-batch cap, all backed by Redis counters that reset every clock hour.
// Called from workers/emailWorker.ts right before sending; status is also
// exposed read-only via GET /api/emails/rate-limit-status (routes/emails.ts).
import { redis } from '../db/redis';
import { config } from '../config';

// lua script to atomically check and increment rate limit counters.
// returns 1 if allowed, 0 if limit exceeded.
// this prevents race conditions when multiple workers run in parallel.
// Redis executes Lua scripts atomically, so this check-then-increment can't
// be split by another worker's request in between — without that atomicity,
// two workers checking "am I under the limit?" at the same instant could
// both pass and together push the count over the limit.
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

// Builds a Redis key suffix identifying "the current clock hour" in UTC
// (e.g. "2026-8-16-14"), so every counter automatically resets once the
// hour rolls over — there's no separate cleanup job needed.
function getHourWindow(): string {
  const now = new Date();
  return `${now.getUTCFullYear()}-${now.getUTCMonth()}-${now.getUTCDate()}-${now.getUTCHours()}`;
}

// Computes how many milliseconds remain until the top of the next UTC hour,
// used to tell a blocked job how long to wait before its counters reset.
function getNextHourMs(): number {
  const now = new Date();
  const next = new Date(now);
  next.setUTCHours(next.getUTCHours() + 1, 0, 0, 0);
  return next.getTime() - now.getTime();
}

/**
 * Attempts to reserve "permission" to send one email right now, checking
 * (and if allowed, incrementing) the global hourly cap, the per-sender
 * hourly cap, and — if the caller supplied one — a per-batch hourly cap.
 * All three checks must pass for the send to be allowed.
 *
 * @param senderEmail - The sender address whose per-sender counter to check.
 * @param batchId - Optional id shared by all emails in one compose batch;
 *                   required (with batchMaxPerHour) to enable the batch cap.
 * @param batchMaxPerHour - Optional user-configured cap for this batch only.
 * @returns `allowed: true` if the send may proceed (counters already
 *          incremented); otherwise `allowed: false` plus how many ms until
 *          the next hourly window, so the caller can reschedule the job.
 */
export async function tryAcquireRateLimit(
  senderEmail: string,
  batchId?: string,
  batchMaxPerHour?: number
): Promise<{
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

  if (result !== 1) {
    return { allowed: false, delayUntilNextWindowMs: getNextHourMs() };
  }

  // check optional per-batch hourly cap
  // This is a separate, ad-hoc Lua script (rather than reusing
  // checkAndIncrLua) because the batch cap is optional and only involves one
  // counter, whereas checkAndIncrLua always checks/increments exactly two.
  if (batchId && batchMaxPerHour && batchMaxPerHour > 0) {
    const batchKey = `rate:batch:${batchId}:${window}`;
    const batchScript = `
      local key = KEYS[1]
      local max = tonumber(ARGV[1])
      local count = tonumber(redis.call('GET', key) or 0)
      if count >= max then return 0 end
      redis.call('INCR', key)
      redis.call('EXPIRE', key, 3600)
      return 1
    `;
    const batchResult = await redis.eval(batchScript, 1, batchKey, String(batchMaxPerHour)) as number;
    if (batchResult !== 1) {
      // undo global/sender increment since we're blocking this job
      // We already incremented the global/sender counters above (in the
      // combined atomic check) before we knew the batch cap would fail, so
      // we have to roll those back here to avoid over-counting jobs that
      // never actually got permission to send.
      await redis.eval(
        `redis.call('DECR', KEYS[1]); redis.call('DECR', KEYS[2]); return 1`,
        2, globalKey, senderKey
      );
      return { allowed: false, delayUntilNextWindowMs: getNextHourMs() };
    }
  }

  return { allowed: true, delayUntilNextWindowMs: 0 };
}

/**
 * Reads (without modifying) the current global send count for this hour,
 * for display/debugging purposes — e.g. a status widget showing how close
 * the system is to its hourly cap.
 *
 * @returns The current global count, the configured max, and which hour
 *          window the count applies to.
 */
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
