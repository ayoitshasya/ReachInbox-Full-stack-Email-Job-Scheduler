import dotenv from 'dotenv';
dotenv.config();

export const config = {
  port: parseInt(process.env.PORT || '3001'),
  nodeEnv: process.env.NODE_ENV || 'development',

  databaseUrl: process.env.DATABASE_URL || '',

  redisUrl: process.env.REDIS_URL || 'redis://localhost:6379',

  google: {
    clientId: process.env.GOOGLE_CLIENT_ID || '',
    clientSecret: process.env.GOOGLE_CLIENT_SECRET || '',
    callbackUrl: process.env.GOOGLE_CALLBACK_URL || 'http://localhost:3001/api/auth/google/callback',
  },

  jwtSecret: process.env.JWT_SECRET || 'dev-secret-change-me',

  frontendUrl: process.env.FRONTEND_URL || 'http://localhost:5173',

  worker: {
    concurrency: parseInt(process.env.WORKER_CONCURRENCY || '5'),
    minSendDelayMs: parseInt(process.env.MIN_SEND_DELAY_MS || '500'),
  },

  rateLimit: {
    maxPerHour: parseInt(process.env.MAX_EMAILS_PER_HOUR || '1000'),
    maxPerHourPerSender: parseInt(process.env.MAX_EMAILS_PER_HOUR_PER_SENDER || '200'),
  },
};
