// Sets up the single shared Prisma client used to talk to Postgres across the
// whole backend. Every file that needs database access imports `prisma` from
// here rather than instantiating its own client.
// Closely related to: backend/prisma/schema.prisma (defines the models this
// client exposes methods for, e.g. prisma.user, prisma.emailJob).
import { PrismaClient } from '@prisma/client';

// We stash the client on the global object (outside of module scope) so that
// hot-reloading in development doesn't spin up a brand new PrismaClient (and
// therefore a new DB connection pool) on every file save.
const globalForPrisma = globalThis as unknown as { prisma: PrismaClient };

export const prisma =
  globalForPrisma.prisma ||
  new PrismaClient({
    // Keep query logs quiet outside development to avoid noisy production logs.
    log: process.env.NODE_ENV === 'development' ? ['error', 'warn'] : ['error'],
  });

// Only cache the client globally outside production — in production each
// process should just create one client normally at startup.
if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;
