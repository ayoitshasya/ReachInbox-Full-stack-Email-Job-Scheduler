// Shared TypeScript types for API data used across the frontend. These
// mirror the shapes returned by the backend (backend/prisma/schema.prisma
// and backend/src/routes/*.ts) so components can rely on consistent typing
// instead of redeclaring these shapes locally.

// The authenticated user's profile, as returned by GET /api/auth/me.
export interface User {
  id: string;
  email: string;
  name: string;
  avatar?: string | null;
  createdAt: string;
}

// Mirrors the backend's Prisma `JobStatus` enum (backend/prisma/schema.prisma).
export type JobStatus = 'PENDING' | 'PROCESSING' | 'SENT' | 'FAILED' | 'RESCHEDULED';

// A single scheduled/sent email, as returned by GET /api/emails/scheduled
// and GET /api/emails/sent.
export interface EmailJob {
  id: string;
  recipient: string;
  subject: string;
  body: string;
  scheduledAt: string;
  sentAt?: string | null;
  status: JobStatus;
  previewUrl?: string | null;
  errorMsg?: string | null;
  batchId?: string | null;
  createdAt: string;
  sender: {
    email: string;
    displayName: string;
  };
}

// A selectable "From" address, as returned by GET /api/emails/senders.
export interface EmailSender {
  id: string;
  email: string;
  displayName: string;
}

// Generic shape for paginated list endpoints (scheduled/sent emails).
export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  limit: number;
}

// Request body sent to POST /api/emails/schedule when composing a new batch.
export interface ScheduleEmailPayload {
  recipients: string[];
  subject: string;
  body: string;
  senderId: string;
  scheduledAt: string;
  delayBetweenMs?: number;
  batchMaxPerHour?: number;
}
