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

app.use(cors({
  origin: config.frontendUrl,
  credentials: true,
}));

app.use(express.json({ limit: '2mb' }));
app.use(passport.initialize());

app.use('/api/auth', authRoutes);
app.use('/api/emails', emailRoutes);

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', ts: new Date().toISOString() });
});

// catch-all 404
app.use((_req, res) => {
  res.status(404).json({ error: 'not found' });
});

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

start().catch((err) => {
  console.error('startup failed:', err);
  process.exit(1);
});

process.on('SIGINT', async () => {
  await prisma.$disconnect();
  process.exit(0);
});
