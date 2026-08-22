import { Worker, Job } from 'bullmq';
import IORedis from 'ioredis';
import { config } from '../config';
import { prisma } from '../db/prisma';
import { EmailJobData } from '../queues/emailQueue';
import { emailQueue } from '../queues/emailQueue';
import { tryAcquireRateLimit } from '../services/rateLimiter';
import { sendEtherealEmail } from '../services/ethereal';

// worker needs its own redis connection (bullmq requirement)
const workerRedis = new IORedis(config.redisUrl, {
  maxRetriesPerRequest: null,
});

async function processEmailJob(job: Job<EmailJobData>): Promise<void> {
  const { emailJobId, recipient, subject, body, senderEmail, senderId, batchId, batchMaxPerHour } = job.data;

  // idempotency: skip if already sent
  const emailJob = await prisma.emailJob.findUnique({
    where: { id: emailJobId },
    include: { sender: true },
  });

  if (!emailJob) {
    console.warn(`job ${emailJobId} not found in db, skipping`);
    return;
  }

  if (emailJob.status === 'SENT') {
    console.log(`job ${emailJobId} already sent, skipping`);
    return;
  }

  // mark processing
  await prisma.emailJob.update({
    where: { id: emailJobId },
    data: { status: 'PROCESSING' },
  });

  // check rate limits before sending
  const { allowed, delayUntilNextWindowMs } = await tryAcquireRateLimit(senderEmail, batchId, batchMaxPerHour);

  if (!allowed) {
    console.log(`rate limit hit for ${senderEmail}, rescheduling job ${emailJobId} in ${delayUntilNextWindowMs}ms`);

    await prisma.emailJob.update({
      where: { id: emailJobId },
      data: { status: 'RESCHEDULED' },
    });

    // re-enqueue with delay to next hour window
    // using a new job id so bullmq accepts it (original is done/removed)
    const retryJobId = `email-${emailJobId}-reschedule-${Date.now()}`;
    await emailQueue.add('send-email', job.data, {
      delay: delayUntilNextWindowMs,
      jobId: retryJobId,
    });

    return;
  }

  // send the email
  try {
    const previewUrl = await sendEtherealEmail({
      to: recipient,
      subject,
      body,
      senderEmail,
      senderName: emailJob.sender.displayName,
      etherealUser: emailJob.sender.etherealUser,
      etherealPass: emailJob.sender.etherealPass,
    });

    await prisma.emailJob.update({
      where: { id: emailJobId },
      data: {
        status: 'SENT',
        sentAt: new Date(),
        previewUrl: previewUrl || undefined,
      },
    });

    console.log(`sent email to ${recipient} (job ${emailJobId})${previewUrl ? ` preview: ${previewUrl}` : ''}`);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'unknown error';
    console.error(`failed to send email ${emailJobId}: ${msg}`);

    await prisma.emailJob.update({
      where: { id: emailJobId },
      data: { status: 'FAILED', errorMsg: msg },
    });

    throw err; // let bullmq handle retries
  }
}

export function startWorker() {
  const worker = new Worker<EmailJobData>('email-scheduler', processEmailJob, {
    connection: workerRedis,
    concurrency: config.worker.concurrency,
    // min delay between sends — bullmq processes at most 1 job per minSendDelayMs
    limiter: {
      max: 1,
      duration: config.worker.minSendDelayMs,
    },
  });

  worker.on('completed', (job) => {
    console.log(`job ${job.id} completed`);
  });

  worker.on('failed', (job, err) => {
    console.error(`job ${job?.id} failed: ${err.message}`);
  });

  worker.on('stalled', (jobId) => {
    // stalled jobs happen when worker crashes mid-processing; bullmq moves them back to wait
    console.warn(`job ${jobId} stalled and will be retried`);
  });

  worker.on('error', (err) => {
    console.error('worker error:', err.message);
  });

  console.log(`email worker started (concurrency: ${config.worker.concurrency}, min delay: ${config.worker.minSendDelayMs}ms)`);
  return worker;
}
