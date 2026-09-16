// This file is the single source of truth for all environment-driven settings
// used across the backend (API server + worker process). Every other backend
// file that needs an env-derived value should import `config` from here instead
// of reading `process.env` directly, so defaults stay consistent in one place.
// Closely related to: backend/.env.example (documents the variables below).
import dotenv from 'dotenv';
// Loads variables from a local .env file into process.env (no-op in
// environments like Railway/Vercel where env vars are injected directly).
dotenv.config();

// Centralized, typed configuration object. Each field falls back to a sane
// local-development default so the app can boot without a .env file present.
export const config = {
  // Port the Express API server listens on.
  port: parseInt(process.env.PORT || '3001'),
  // 'development' | 'production' | etc. — used to toggle logging verbosity elsewhere.
  nodeEnv: process.env.NODE_ENV || 'development',

  // Postgres connection string consumed by Prisma (see backend/prisma/schema.prisma).
  databaseUrl: process.env.DATABASE_URL || '',

  // Redis connection string used for BullMQ queues/workers and rate limiting.
  redisUrl: process.env.REDIS_URL || 'redis://localhost:6379',

  // Google OAuth credentials for "Sign in with Google" (see routes/auth.ts).
  google: {
    clientId: process.env.GOOGLE_CLIENT_ID || '',
    clientSecret: process.env.GOOGLE_CLIENT_SECRET || '',
    callbackUrl: process.env.GOOGLE_CALLBACK_URL || 'http://localhost:3001/api/auth/google/callback',
  },

  // Secret used to sign/verify our own JWTs (separate from Google's tokens).
  // NOTE: the fallback is only safe for local dev — production must set a real secret.
  jwtSecret: process.env.JWT_SECRET || 'dev-secret-change-me',

  // URL of the deployed frontend, used for CORS and for building OAuth redirect links.
  frontendUrl: process.env.FRONTEND_URL || 'http://localhost:5173',

  worker: {
    // How many email jobs the BullMQ worker can process at the same time.
    concurrency: parseInt(process.env.WORKER_CONCURRENCY || '5'),
    // Minimum time (ms) BullMQ's limiter enforces between processing consecutive
    // jobs, to avoid hammering the SMTP provider too fast.
    minSendDelayMs: parseInt(process.env.MIN_SEND_DELAY_MS || '500'),
  },

  rateLimit: {
    // Hard cap on emails sent across all senders combined, per rolling hour window.
    maxPerHour: parseInt(process.env.MAX_EMAILS_PER_HOUR || '1000'),
    // Hard cap on emails sent by any single sender address, per rolling hour window.
    maxPerHourPerSender: parseInt(process.env.MAX_EMAILS_PER_HOUR_PER_SENDER || '200'),
  },
};
