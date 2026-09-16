// Main entry point for the backend API server (started via `npm start` /
// `npm run dev` in backend/package.json). Wires up Express, CORS, Passport
// (for Google OAuth), mounts the auth and email routers, and — for local/dev
// simplicity — also boots the BullMQ email worker in the same process.
// Closely related to: routes/auth.ts, routes/emails.ts, workers/emailWorker.ts,
// services/ethereal.ts (seeds test email senders on first run).
import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import passport from 'passport';
import { config } from './config';
import { prisma } from './db/prisma';
import { ensureSendersExist } from './services/ethereal';
import authRoutes from './routes/auth';
import emailRoutes from './routes/emails';
import { startWorker } from './workers/emailWorker';

const app = express();

// Only allow requests from the configured frontend origin, and allow
// cookies/auth headers to be sent cross-origin.
app.use(cors({
  origin: config.frontendUrl,
  credentials: true,
}));

// Parse JSON bodies; 2mb limit accommodates larger recipient lists pasted
// into the compose form without allowing arbitrarily huge payloads.
app.use(express.json({ limit: '2mb' }));
// Initializes Passport without session support — we use stateless JWTs
// instead of server-side sessions (see middleware/auth.ts).
app.use(passport.initialize());

app.use('/api/auth', authRoutes);
app.use('/api/emails', emailRoutes);

// Simple liveness/health check endpoint for uptime monitors and deploy platforms.
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', ts: new Date().toISOString() });
});

// catch-all 404
app.use((_req, res) => {
  res.status(404).json({ error: 'not found' });
});

// Bootstraps the server: connects to the database, makes sure at least one
// Ethereal test sender exists, starts the background worker, then opens the
// HTTP listener. Order matters — we want the DB and senders ready before we
// start accepting traffic or processing jobs.
async function start() {
  await prisma.$connect();
  console.log('database connected');

  await ensureSendersExist();

  // start the worker in the same process for simplicity.
  // in production you'd run `npm run worker` in a separate process/container.
  startWorker();

  app.listen(config.port, () => {
    console.log(`api server running on http://localhost:${config.port}`);
  });
}

// If startup fails (e.g. bad DB credentials), log it and exit non-zero so
// the process manager/deploy platform knows the boot failed.
start().catch((err) => {
  console.error('startup failed:', err);
  process.exit(1);
});

// Gracefully close the database connection when the process is interrupted
// (e.g. Ctrl+C locally) so Prisma doesn't leave dangling connections.
process.on('SIGINT', async () => {
  await prisma.$disconnect();
  process.exit(0);
});
