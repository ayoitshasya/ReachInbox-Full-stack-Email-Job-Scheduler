// Express router for the core email-scheduling feature: creating a batch of
// scheduled emails, and listing scheduled/sent emails and available senders
// for the logged-in user. Mounted at /api/emails in backend/src/index.ts.
// Every job created here is persisted to Postgres (via Prisma) AND enqueued
// in BullMQ (queues/emailQueue.ts); the worker (workers/emailWorker.ts) is
// what actually sends the emails later and updates their status.
import { Router, Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { prisma } from '../db/prisma';
import { requireAuth } from '../middleware/auth';
import { emailQueue } from '../queues/emailQueue';
import { getRateLimitStatus } from '../services/rateLimiter';

const router = Router();

// Every route below requires a valid JWT — applied once here instead of
// per-route.
router.use(requireAuth);

// Expected JSON body for POST /schedule.
interface ScheduleEmailBody {
  recipients: string[];
  subject: string;
  body: string;
  senderId: string;
  scheduledAt: string; // ISO string for the first email
  delayBetweenMs?: number; // delay between consecutive emails in the batch
  batchMaxPerHour?: number; // optional per-batch hourly send cap
}

// schedule a batch of emails
// Creates one EmailJob database row and one delayed BullMQ job per
// recipient, spacing each recipient's send time out by `delayBetweenMs`
// starting from `scheduledAt`. This is the endpoint the "Compose" modal on
// the frontend calls after the user uploads recipients and hits schedule.
router.post('/schedule', async (req: Request, res: Response) => {
  const { recipients, subject, body, senderId, scheduledAt, delayBetweenMs = 1000, batchMaxPerHour }: ScheduleEmailBody = req.body;

  if (!recipients?.length || !subject || !body || !senderId || !scheduledAt) {
    res.status(400).json({ error: 'missing required fields' });
    return;
  }

  // Guards against accidentally (or maliciously) scheduling an enormous
  // batch that could overwhelm the queue/SMTP provider in one request.
  if (recipients.length > 5000) {
    res.status(400).json({ error: 'maximum 5000 recipients per batch' });
    return;
  }

  const sender = await prisma.emailSender.findUnique({ where: { id: senderId } });
  if (!sender) {
    res.status(404).json({ error: 'sender not found' });
    return;
  }

  const startTime = new Date(scheduledAt);
  if (isNaN(startTime.getTime())) {
    res.status(400).json({ error: 'invalid scheduledAt date' });
    return;
  }

  // A single batchId ties all recipients in this request together, so we
  // can look them up as a group later (e.g. for the optional per-batch
  // hourly send cap in the rate limiter).
  const batchId = uuidv4();
  const now = Date.now();
  const startMs = startTime.getTime();

  // create all db records in one batch insert
  // Each recipient's scheduled time is staggered by `delayBetweenMs` from
  // the previous one (i * delayBetweenMs), so emails go out gradually
  // instead of all at the exact same instant.
  const jobsData = recipients.map((recipient, i) => ({
    id: uuidv4(),
    recipient: recipient.trim().toLowerCase(),
    subject,
    body,
    senderId,
    userId: req.jwtUser!.userId,
    scheduledAt: new Date(startMs + i * delayBetweenMs),
    batchId,
  }));

  await prisma.emailJob.createMany({ data: jobsData });

  // enqueue bullmq delayed jobs
  // Mirrors each DB row as a BullMQ job carrying just what the worker needs
  // to send the email (see EmailJobData in queues/emailQueue.ts).
  const bullJobs = jobsData.map((job) => ({
    name: 'send-email',
    data: {
      emailJobId: job.id,
      recipient: job.recipient,
      subject: job.subject,
      body: job.body,
      senderEmail: sender.email,
      senderId: sender.id,
      batchId,
      ...(batchMaxPerHour ? { batchMaxPerHour } : {}),
    },
    opts: {
      jobId: `email-${job.id}`, // deterministic id prevents duplicates on restart
      // BullMQ's `delay` is relative to "now", so we convert each job's
      // absolute scheduledAt into a millisecond offset. Clamped to 0 in case
      // a computed scheduledAt somehow already passed.
      delay: Math.max(0, job.scheduledAt.getTime() - now),
    },
  }));

  await emailQueue.addBulk(bullJobs);

  // update db with bullmq job ids
  // Stored so the worker/DB stay linkable (e.g. for future cancellation
  // features or debugging which queue job maps to which DB row).
  await Promise.all(
    jobsData.map((job, i) =>
      prisma.emailJob.update({
        where: { id: job.id },
        data: { bullmqJobId: bullJobs[i].opts.jobId },
      })
    )
  );

  res.status(201).json({
    batchId,
    scheduled: jobsData.length,
    firstEmailAt: startTime.toISOString(),
  });
});

// get scheduled (pending/rescheduled) emails for the current user
// Paginated list of the current user's not-yet-delivered emails (still
// pending, actively being processed, or bumped to a later hour by the rate
// limiter). Powers the "Scheduled" tab on the dashboard.
router.get('/scheduled', async (req: Request, res: Response) => {
  const page = parseInt(String(req.query.page || '1'));
  const limit = Math.min(parseInt(String(req.query.limit || '20')), 100);
  const skip = (page - 1) * limit;

  const [items, total] = await Promise.all([
    prisma.emailJob.findMany({
      where: {
        userId: req.jwtUser!.userId,
        status: { in: ['PENDING', 'PROCESSING', 'RESCHEDULED'] },
      },
      orderBy: { scheduledAt: 'asc' },
      skip,
      take: limit,
      include: { sender: { select: { email: true, displayName: true } } },
    }),
    prisma.emailJob.count({
      where: {
        userId: req.jwtUser!.userId,
        status: { in: ['PENDING', 'PROCESSING', 'RESCHEDULED'] },
      },
    }),
  ]);

  res.json({ items, total, page, limit });
});

// get sent/failed emails for the current user
// Paginated list of emails that the worker has already attempted to deliver
// (successfully or not). Powers the "Sent" tab on the dashboard.
router.get('/sent', async (req: Request, res: Response) => {
  const page = parseInt(String(req.query.page || '1'));
  const limit = Math.min(parseInt(String(req.query.limit || '20')), 100);
  const skip = (page - 1) * limit;

  const [items, total] = await Promise.all([
    prisma.emailJob.findMany({
      where: {
        userId: req.jwtUser!.userId,
        status: { in: ['SENT', 'FAILED'] },
      },
      orderBy: { sentAt: 'desc' },
      skip,
      take: limit,
      include: { sender: { select: { email: true, displayName: true } } },
    }),
    prisma.emailJob.count({
      where: {
        userId: req.jwtUser!.userId,
        status: { in: ['SENT', 'FAILED'] },
      },
    }),
  ]);

  res.json({ items, total, page, limit });
});

// get available senders
// Returns the list of Ethereal test-email accounts the user can pick from
// as a "From" address when composing (see services/ethereal.ts for how
// these accounts get created).
router.get('/senders', async (_req: Request, res: Response) => {
  const senders = await prisma.emailSender.findMany({
    select: { id: true, email: true, displayName: true },
    orderBy: { createdAt: 'asc' },
  });
  res.json(senders);
});

// rate limit status (useful for debugging/display)
router.get('/rate-limit-status', async (_req: Request, res: Response) => {
  const status = await getRateLimitStatus();
  res.json(status);
});

export default router;
