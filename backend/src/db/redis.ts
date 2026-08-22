import IORedis from 'ioredis';
import { config } from '../config';

// shared redis connection used across the app
export const redis = new IORedis(config.redisUrl, {
  maxRetriesPerRequest: null, // required by bullmq
});

redis.on('error', (err) => {
  console.error('redis connection error:', err.message);
});

redis.on('connect', () => {
  console.log('redis connected');
});
