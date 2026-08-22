import { Queue } from 'bullmq';
import { redis } from '../db/redis';

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
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 2000,
    },
    removeOnComplete: {
      count: 500,
      age: 60 * 60 * 24 * 7, // keep for a week
    },
    removeOnFail: {
      count: 200,
    },
  },
});

emailQueue.on('error', (err) => {
  console.error('queue error:', err.message);
});
