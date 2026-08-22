import { Router, Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { prisma } from '../db/prisma';
import { requireAuth } from '../middleware/auth';
import { emailQueue } from '../queues/emailQueue';
import { getRateLimitStatus } from '../services/rateLimiter';

const router = Router();

router.use(requireAuth);

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
router.post('/schedule', async (req: Request, res: Response) => {
  const { recipients, subject, body, senderId, scheduledAt, delayBetweenMs = 1000, batchMaxPerHour }: ScheduleEmailBody = req.body;

  if (!recipients?.length || !subject || !body || !senderId || !scheduledAt) {
    res.status(400).json({ error: 'missing required fields' });
    return;
  }

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

  const batchId = uuidv4();
  const now = Date.now();
  const startMs = startTime.getTime();

  // create all db records in one batch insert
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
      delay: Math.max(0, job.scheduledAt.getTime() - now),
    },
  }));

  await emailQueue.addBulk(bullJobs);

  // update db with bullmq job ids
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
