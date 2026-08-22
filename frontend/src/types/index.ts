export interface User {
  id: string;
  email: string;
  name: string;
  avatar?: string | null;
  createdAt: string;
}

export type JobStatus = 'PENDING' | 'PROCESSING' | 'SENT' | 'FAILED' | 'RESCHEDULED';

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

export interface EmailSender {
  id: string;
  email: string;
  displayName: string;
}

export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  limit: number;
}

export interface ScheduleEmailPayload {
  recipients: string[];
  subject: string;
  body: string;
  senderId: string;
  scheduledAt: string;
  delayBetweenMs?: number;
}
