// The consumer side of the email-scheduling pipeline: a BullMQ Worker that
// pulls jobs off the 'email-scheduler' queue (produced by
// routes/emails.ts via queues/emailQueue.ts) and actually sends each email
// through services/ethereal.ts, after checking services/rateLimiter.ts.
// Started either inline by backend/src/index.ts (dev) or standalone by
// backend/src/worker.ts (production).
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

/**
 * Handles a single queued email job: verifies it hasn't already been sent,
 * marks it as processing, checks the rate limiter, and either sends the
 * email or reschedules/fails the job depending on the outcome.
 *
 * This function is the BullMQ "processor" — it's invoked automatically by
 * the Worker created in startWorker() below for every job pulled off the
 * queue, one job per call.
 *
 * @param job - The BullMQ job, carrying an EmailJobData payload describing
 *              which email to send.
 * @throws Re-throws any error from the actual send attempt (after recording
 *         it on the DB row) so BullMQ's built-in retry/backoff logic
 *         (configured in queues/emailQueue.ts) can kick in.
 */
async function processEmailJob(job: Job<EmailJobData>): Promise<void> {
  const { emailJobId, recipient, subject, body, senderEmail, senderId, batchId, batchMaxPerHour } = job.data;

  // idempotency: skip if already sent
  // Guards against double-sending if the same job somehow gets processed
  // twice (e.g. after a worker crash and BullMQ's stalled-job recovery).
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
    // BullMQ refuses to add a job whose id was already used, and the
    // current job's id is in the process of being marked done — so a fresh,
    // time-stamped id is needed for the retry to be accepted.
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

/**
 * Creates and starts the BullMQ Worker that consumes the 'email-scheduler'
 * queue, wiring up logging for job lifecycle events (completed/failed/
 * stalled/error). Safe to call once per process — call sites are
 * backend/src/index.ts (inline, alongside the API server) and
 * backend/src/worker.ts (standalone worker process).
 *
 * @returns The running BullMQ Worker instance.
 */
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
