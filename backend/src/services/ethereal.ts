import nodemailer from 'nodemailer';
import { prisma } from '../db/prisma';

interface SendMailOptions {
  to: string;
  subject: string;
  body: string;
  senderEmail: string;
  senderName: string;
  etherealUser: string;
  etherealPass: string;
}

export async function sendEtherealEmail(opts: SendMailOptions): Promise<string | null> {
  const transporter = nodemailer.createTransport({
    host: 'smtp.ethereal.email',
    port: 587,
    auth: {
      user: opts.etherealUser,
      pass: opts.etherealPass,
    },
  });

  const info = await transporter.sendMail({
    from: `"${opts.senderName}" <${opts.senderEmail}>`,
    to: opts.to,
    subject: opts.subject,
    text: opts.body,
    html: `<p>${opts.body.replace(/\n/g, '<br>')}</p>`,
  });

  // nodemailer returns a preview url for ethereal accounts
  const previewUrl = nodemailer.getTestMessageUrl(info);
  return previewUrl || null;
}

// creates a fresh ethereal test account and saves it to the db.
// called during initial setup to seed senders.
export async function createAndSaveEtherealSender(displayName?: string): Promise<void> {
  const testAccount = await nodemailer.createTestAccount();

  const name = displayName || `ReachInbox Sender ${Date.now()}`;

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
