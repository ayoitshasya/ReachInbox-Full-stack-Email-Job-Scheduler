// Defines the BullMQ queue used to schedule and deliver emails, plus the
// shape of the data each queued job carries. Producers (routes/emails.ts)
// call `emailQueue.addBulk(...)` to enqueue delayed jobs; the consumer side
// lives in workers/emailWorker.ts, which processes jobs from this same queue.
import { Queue } from 'bullmq';
import { redis } from '../db/redis';

// Data payload attached to every BullMQ job in the 'email-scheduler' queue.
// This must contain everything the worker needs to send the email without
// having to re-query unrelated tables.
export interface EmailJobData {
  emailJobId: string;
  recipient: string;
  subject: string;
  body: string;
  senderEmail: string;
  senderId: string;
  batchId?: string;
  // optional per-batch hourly cap set by the user at compose time
  batchMaxPerHour?: number;
}

// all email jobs go through this queue
export const emailQueue = new Queue<EmailJobData>('email-scheduler', {
  connection: redis,
  defaultJobOptions: {
    // Retry a failed send (e.g. transient SMTP error) up to 3 times.
    attempts: 3,
    backoff: {
      // Wait longer between each retry (2s, 4s, 8s...) so a struggling
      // SMTP provider gets breathing room instead of being retried immediately.
      type: 'exponential',
      delay: 2000,
    },
    removeOnComplete: {
      // Cap Redis memory usage by only retaining the most recent 500
      // completed jobs, and never keeping any older than a week.
      count: 500,
      age: 60 * 60 * 24 * 7, // keep for a week
    },
    removeOnFail: {
      // Keep more failed jobs around than completed ones since they're
      // useful for debugging delivery problems.
      count: 200,
    },
  },
});

// Surfaces queue-level errors (e.g. Redis connectivity issues) in the logs
// instead of letting them fail silently.
emailQueue.on('error', (err) => {
  console.error('queue error:', err.message);
});
