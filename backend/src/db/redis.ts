// Creates the shared Redis connection used by the API server for things like
// the rate limiter (services/rateLimiter.ts) and the BullMQ email queue
// (queues/emailQueue.ts). The worker process creates its own separate
// connection (see workers/emailWorker.ts) because BullMQ workers require a
// dedicated connection rather than sharing one.
import IORedis from 'ioredis';
import { config } from '../config';

// shared redis connection used across the app
export const redis = new IORedis(config.redisUrl, {
  maxRetriesPerRequest: null, // required by bullmq
});

// Log (but don't crash on) connection errors — IORedis will keep retrying
// to reconnect automatically.
redis.on('error', (err) => {
  console.error('redis connection error:', err.message);
});

redis.on('connect', () => {
  console.log('redis connected');
});
