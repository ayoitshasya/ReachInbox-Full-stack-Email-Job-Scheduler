import 'dotenv/config';
import { startWorker } from './workers/emailWorker';
import { prisma } from './db/prisma';

// standalone worker entry point — run separately from the api server
async function main() {
  console.log('starting email worker process...');
  startWorker();

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
