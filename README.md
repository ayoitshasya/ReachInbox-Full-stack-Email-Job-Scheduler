# ReachInbox Email Scheduler

A full-stack email job scheduler built with Express, BullMQ, Redis, Postgres, and React.

---

## Quick Start

### 1. Prerequisites

- Node 18+
- Docker + Docker Compose

### 2. Spin Up Redis and Postgres

```bash
docker compose up -d
```

This starts Redis on `:6379` and Postgres on `:5432`.

### 3. Backend Setup

```bash
cd backend
cp .env.example .env
# fill in your GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, and JWT_SECRET in .env
npm install
npx prisma migrate dev --name init
npm run dev
```

The API server starts on `http://localhost:3001`.

To run the worker as a **separate process** (for production-like separation):

```bash
# in a second terminal
cd backend
npm run worker
```

By default, `npm run dev` starts the worker in the same process for convenience.

### 4. Frontend Setup

```bash
cd frontend
npm install
npm run dev
```

The frontend starts on `http://localhost:5173`.

### 5. Google OAuth Setup

1. Go to Google Cloud Console → Credentials → Create OAuth 2.0 Client ID.
2. Set the authorized redirect URI to `http://localhost:3001/api/auth/google/callback`.
3. Copy the client ID and secret into `backend/.env`.

### 6. Ethereal Email

Ethereal test accounts are created automatically on first startup — no configuration needed. Each sent email gets a preview URL you can click in the Sent Emails table.

---

## Environment Variables

Copy `backend/.env.example` to `backend/.env` and fill in:

| Variable | Description |
|---|---|
| `PORT` | Express port (default `3001`) |
| `DATABASE_URL` | Postgres connection string |
| `REDIS_URL` | Redis connection URL |
| `GOOGLE_CLIENT_ID` | Google OAuth client ID |
| `GOOGLE_CLIENT_SECRET` | Google OAuth client secret |
| `GOOGLE_CALLBACK_URL` | OAuth redirect (default `http://localhost:3001/api/auth/google/callback`) |
| `JWT_SECRET` | JWT signing secret (use a long random string in production) |
| `FRONTEND_URL` | Frontend origin for CORS and OAuth redirect |
| `WORKER_CONCURRENCY` | Number of concurrent BullMQ jobs (default `5`) |
| `MIN_SEND_DELAY_MS` | Minimum ms between individual email sends (default `500`) |
| `MAX_EMAILS_PER_HOUR` | Global hourly send cap (default `1000`) |
| `MAX_EMAILS_PER_HOUR_PER_SENDER` | Per-sender hourly cap (default `200`) |

---

## Architecture

### Scheduling Flow

1. Client posts `/api/emails/schedule` with recipients, subject, body, sender, start time, and delay between sends.
2. The API creates one `EmailJob` row in Postgres per recipient, with `scheduledAt = startTime + (index * delayBetweenMs)`.
3. The API calls `emailQueue.addBulk(...)` — each job gets a deterministic BullMQ job ID (`email-{dbId}`) and a delay calculated from now until its `scheduledAt`.
4. BullMQ stores delayed jobs in Redis sorted sets; they fire at the right time regardless of server restarts.
5. The worker picks up each job, checks rate limits, sends via Ethereal SMTP, and updates Postgres.

### Restart Persistence

Jobs are never re-enqueued from Postgres on startup. BullMQ stores all pending and delayed jobs in Redis, so they survive server restarts automatically. The deterministic job ID (`email-{dbId}`) means re-enqueueing the same job (e.g. from a buggy retry) is a no-op — BullMQ deduplicates by job ID.

If the worker crashes while actively processing a job, BullMQ's stalled-job detection moves it back to the wait queue after a timeout (default ~30s). The worker then re-processes it; the idempotency check at the top of the processor (skipping jobs already marked `SENT` in Postgres) prevents double-sends.

### Rate Limiting

**Design:** Redis-backed counters, keyed by hour window + scope. A Lua script atomically checks and increments so multiple worker instances can't race past the limit.

Keys used:
- `rate:global:{year}-{month}-{day}-{hour}` — global counter, TTL 1 hour
- `rate:sender:{email}:{window}` — per-sender counter, TTL 1 hour
- `rate:batch:{batchId}:{window}` — optional per-batch cap set at compose time

When a job tries to acquire a rate limit token:
1. The Lua script checks both global and sender counters atomically.
2. If either is at the limit, it returns "denied".
3. On denial, the job is re-enqueued with `delay = ms_until_next_hour_boundary` and its DB status is set to `RESCHEDULED`.
4. Jobs within a batch stay in order because they all get the same delay and BullMQ processes them FIFO within each time window.

**Why not in-memory?** If you run multiple worker processes (or nodes in Kubernetes), each process would have its own counter and you'd blow past the limit by Nx. Redis counters are shared, so the limit holds regardless of worker count.

### Minimum Delay Between Sends

The BullMQ worker is configured with:
```
limiter: { max: 1, duration: MIN_SEND_DELAY_MS }
```

This means the worker processes at most 1 job per `MIN_SEND_DELAY_MS` milliseconds, creating a guaranteed minimum gap between sends at the worker level. The default is 500ms. With concurrency > 1, the effective throughput is `concurrency / MIN_SEND_DELAY_MS` jobs per second, but each individual job still has the minimum gap enforced by the queue.

### Handling 1000+ Emails at the Same Time

Scheduling 1000 emails for the same start time creates 1000 individual BullMQ delayed jobs with `delay = 0`. They all land in the wait queue simultaneously. The worker processes them at its configured concurrency and rate. The rate limiting logic prevents burst delivery — if the hourly cap is 1000, exactly 1000 go out per hour, with the rest rescheduled. No data is lost; nothing crashes; Postgres holds the full record.

### Trade-offs and Assumptions

- **Worker in-process:** By default the worker starts inside the API process (`npm run dev`). This is convenient for local dev but in production you'd run `npm run worker` separately so the API and worker can scale independently.
- **JWT, not sessions:** Stateless auth means no session store needed. The downside is tokens can't be invalidated before expiry (7 days). For this use case that's acceptable.
- **Ethereal account creation at startup:** Two Ethereal accounts are created if none exist. In a real app you'd configure senders manually or via an admin UI.
- **No WebSocket/SSE:** The dashboard polls every 15 seconds for status updates. For a production product you'd want server-sent events or webhooks to push updates.
- **Prisma:** Chosen for TypeScript-first DX and a clean migration workflow. Drizzle would be lighter, but Prisma's type generation is hard to beat for rapid prototyping.
- **Single queue:** All email jobs share one BullMQ queue. For very high volume you might shard by sender or priority.

---

## Feature Checklist

### Backend
- [x] Scheduling API (`POST /api/emails/schedule`)
- [x] Batch insert into Postgres
- [x] BullMQ delayed jobs (no cron, no node-cron)
- [x] Ethereal SMTP sending with preview URLs
- [x] Multiple senders (seeded from Ethereal, stored in DB)
- [x] Restart persistence (jobs in Redis, deterministic job IDs)
- [x] Idempotency (status check before send, BullMQ dedup by job ID)
- [x] Configurable worker concurrency (`WORKER_CONCURRENCY`)
- [x] Minimum delay between sends (`MIN_SEND_DELAY_MS` via BullMQ limiter)
- [x] Global hourly rate limit (`MAX_EMAILS_PER_HOUR`)
- [x] Per-sender hourly rate limit (`MAX_EMAILS_PER_HOUR_PER_SENDER`)
- [x] Per-batch hourly cap (optional, set in Compose modal)
- [x] Redis-backed rate counters (Lua script, safe for multi-worker)
- [x] Reschedule to next hour on rate limit (no dropped jobs)
- [x] Handles 1000+ simultaneous jobs correctly

### Frontend
- [x] Google OAuth login (real, not mocked)
- [x] Redirect to dashboard after login
- [x] Header with name, email, avatar, and logout button
- [x] Dashboard with "Scheduled Emails" and "Sent Emails" tabs
- [x] Compose New Email button
- [x] Compose modal: subject, body, sender selector
- [x] CSV/TXT upload with client-side email parsing and count display
- [x] Start time, delay between emails, and hourly limit fields
- [x] Schedule button with loading state
- [x] Scheduled Emails table with status badges, loading, and empty states
- [x] Sent Emails table with Ethereal preview links, loading, and empty states
- [x] Pagination
- [x] Error toasts
- [x] TypeScript types throughout
