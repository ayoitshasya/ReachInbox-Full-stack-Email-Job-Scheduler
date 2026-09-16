// Wraps Nodemailer + Ethereal Email (https://ethereal.email), a fake SMTP
// service used here instead of a real email provider so the app can "send"
// emails in development/demo without spamming real inboxes — every send
// produces a shareable preview URL instead of landing in a real mailbox.
// Used by workers/emailWorker.ts (actually sending) and backend/src/index.ts
// (seeding sender accounts on startup).
import nodemailer from 'nodemailer';
import { prisma } from '../db/prisma';

// Everything needed to send one email through a specific Ethereal account.
interface SendMailOptions {
  to: string;
  subject: string;
  body: string;
  senderEmail: string;
  senderName: string;
  etherealUser: string;
  etherealPass: string;
}

/**
 * Sends a single email through Ethereal's fake SMTP server using the given
 * sender's credentials.
 *
 * @param opts - Recipient, subject/body, and the Ethereal account to send from.
 * @returns A preview URL for viewing the "sent" email in a browser, or null
 *          if Nodemailer couldn't generate one. Throws if the SMTP send itself fails
 *          (e.g. connection/auth error) — the caller (the worker) is responsible for
 *          catching this and marking the job failed.
 */
export async function sendEtherealEmail(opts: SendMailOptions): Promise<string | null> {
  const transporter = nodemailer.createTransport({
    host: 'smtp.ethereal.email',
    port: 587,
    auth: {
      user: opts.etherealUser,
      pass: opts.etherealPass,
    },
    // Generous timeouts because some hosting providers (see README's Railway
    // note) add noticeable latency talking to Ethereal's SMTP servers.
    connectionTimeout: 30000,
    greetingTimeout: 30000,
    socketTimeout: 30000,
  });

  const info = await transporter.sendMail({
    from: `"${opts.senderName}" <${opts.senderEmail}>`,
    to: opts.to,
    subject: opts.subject,
    text: opts.body,
    // Ethereal only stores what we give it — since the body is plain text,
    // we build a minimal HTML version by turning newlines into <br> tags.
    html: `<p>${opts.body.replace(/\n/g, '<br>')}</p>`,
  });

  // nodemailer returns a preview url for ethereal accounts
  const previewUrl = nodemailer.getTestMessageUrl(info);
  return previewUrl || null;
}

// creates a fresh ethereal test account and saves it to the db.
// called during initial setup to seed senders.
/**
 * Registers a brand-new Ethereal test inbox (via Nodemailer's account
 * creation API) and stores its credentials as an EmailSender row so it can
 * be picked as a "From" address when composing.
 *
 * @param displayName - Friendly name shown in the sender dropdown; defaults
 *                       to a timestamped placeholder if omitted.
 */
export async function createAndSaveEtherealSender(displayName?: string): Promise<void> {
  const testAccount = await nodemailer.createTestAccount();

  const name = displayName || `ReachInbox Sender ${Date.now()}`;

  // Upsert on email so re-running this (e.g. app restart) doesn't create
  // duplicate sender rows if the same Ethereal account were ever reused.
  await prisma.emailSender.upsert({
    where: { email: testAccount.user },
    update: {},
    create: {
      email: testAccount.user,
      displayName: name,
      etherealUser: testAccount.user,
      etherealPass: testAccount.pass,
    },
  });

  console.log(`ethereal sender created: ${testAccount.user}`);
}

/**
 * Startup check that guarantees the app always has at least one usable
 * sender. If the EmailSender table is empty (e.g. first run against a fresh
 * database), it creates two Ethereal test accounts so the compose form
 * always has options.
 */
export async function ensureSendersExist(): Promise<void> {
  const count = await prisma.emailSender.count();
  if (count === 0) {
    console.log('no senders found, creating ethereal test accounts...');
    await Promise.all([
      createAndSaveEtherealSender('ReachInbox Primary'),
      createAndSaveEtherealSender('ReachInbox Secondary'),
    ]);
  }
}
