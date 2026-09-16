// Alternate process entry point (started via `npm run worker` in
// backend/package.json) that runs ONLY the BullMQ email worker, without the
// Express API server. Useful in production so the API and the background
// job processing can be scaled/deployed as separate containers/processes.
// For local dev, backend/src/index.ts already starts the worker inline, so
// this file is not required to run the app locally.
import 'dotenv/config';
import { startWorker } from './workers/emailWorker';
import { prisma } from './db/prisma';

// standalone worker entry point — run separately from the api server
async function main() {
  console.log('starting email worker process...');
  startWorker();

  // Ensures Prisma's DB connection pool is closed cleanly before the
  // process exits, whether it's stopped locally (SIGINT) or by an
  // orchestrator like Docker/Kubernetes (SIGTERM).
  const shutdown = async () => {
    console.log('shutting down worker...');
    await prisma.$disconnect();
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main().catch((err) => {
  console.error('worker startup failed:', err);
  process.exit(1);
});
