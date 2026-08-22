# ReachInbox Email Scheduler

a full-stack email job scheduler built with express, bullmq, redis, postgres, and react.

---

## quick start

### 1. prerequisites

- node 18+
- docker + docker compose

### 2. spin up redis and postgres

```bash
docker compose up -d
```

this starts redis on `:6379` and postgres on `:5432`.

### 3. backend setup

```bash
cd backend
cp .env.example .env
# fill in your GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, and JWT_SECRET in .env
npm install
npx prisma migrate dev --name init
npm run dev
```

the api server starts on `http://localhost:3001`.

to run the worker as a **separate process** (for production-like separation):

```bash
# in a second terminal
cd backend
npm run worker
```

by default, `npm run dev` starts the worker in the same process for convenience.

### 4. frontend setup

```bash
cd frontend
npm install
npm run dev
```

the frontend starts on `http://localhost:5173`.

### 5. google oauth setup

1. go to google cloud console ��� credentials → create oauth 2.0 client id
2. set authorized redirect uri to `http://localhost:3001/api/auth/google/callback`
3. copy client id and secret into `backend/.env`

### 6. ethereal email

ethereal test accounts are created automatically on first startup — no configuration needed. each sent email gets a preview url you can click in the sent emails table.

---

## env vars

copy `backend/.env.example` to `backend/.env` and fill in:

| variable | description |
|---|---|
| `PORT` | express port (default `3001`) |
| `DATABASE_URL` | postgres connection string |
| `REDIS_URL` | redis connection url |
| `GOOGLE_CLIENT_ID` | google oauth client id |
| `GOOGLE_CLIENT_SECRET` | google oauth client secret |
| `GOOGLE_CALLBACK_URL` | oauth redirect (default `http://localhost:3001/api/auth/google/callback`) |
| `JWT_SECRET` | jwt signing secret (use a long random string in production) |
| `FRONTEND_URL` | frontend origin for cors and oauth redirect |
| `WORKER_CONCURRENCY` | number of concurrent bullmq jobs (default `5`) |
| `MIN_SEND_DELAY_MS` | minimum ms between individual email sends (default `500`) |
| `MAX_EMAILS_PER_HOUR` | global hourly send cap (default `1000`) |
| `MAX_EMAILS_PER_HOUR_PER_SENDER` | per-sender hourly cap (default `200`) |

---

## architecture

### scheduling flow

1. client posts `/api/emails/schedule` with recipients, subject, body, sender, start time, and delay between sends
2. api creates one `EmailJob` row in postgres per recipient, with `scheduledAt = startTime + (index * delayBetweenMs)`
3. api calls `emailQueue.addBulk(...)` — each job gets a deterministic bullmq job id (`email-{dbId}`) and a delay calculated from now until its `scheduledAt`
4. bullmq stores delayed jobs in redis sorted sets; they fire at the right time regardless of server restarts
5. the worker picks up each job, checks rate limits, sends via ethereal smtp, and updates postgres

### restart persistence

jobs are never re-enqueued from postgres on startup. bullmq stores all pending and delayed jobs in redis, so they survive server restarts automatically. the deterministic job id (`email-{dbId}`) means re-enqueueing the same job (e.g. from a buggy retry logic) is a no-op — bullmq deduplicates by job id.

if the worker crashes while actively processing a job, bullmq's stalled-job detection moves it back to the wait queue after a timeout (default ~30s). the worker then re-processes it; the idempotency check at the top of the processor (skipping jobs already marked `SENT` in postgres) prevents double-sends.

### rate limiting

**design**: redis-backed counters, keyed by hour window + scope. a lua script atomically checks and increments so multiple worker instances can't race past the limit.

keys used:
- `rate:global:{year}-{month}-{day}-{hour}` — global counter, ttl 1 hour
- `rate:sender:{email}:{window}` — per-sender counter, ttl 1 hour
- `rate:batch:{batchId}:{window}` — optional per-batch cap set at compose time

when a job tries to acquire a rate limit token:
1. lua script checks both global and sender counters atomically
2. if either is at limit, returns "denied"
3. on denial, the job is re-enqueued with `delay = ms_until_next_hour_boundary` and its db status is set to `RESCHEDULED`
4. jobs within a batch stay in order because they all get the same delay and bullmq processes them fifo within each time window

**why not in-memory?** if you run multiple worker processes (or nodes in k8s), each process would have its own counter and you'd blow past the limit by Nx. redis counters are shared, so the limit holds regardless of worker count.

### minimum delay between sends

the bullmq worker is configured with:
```
limiter: { max: 1, duration: MIN_SEND_DELAY_MS }
```

this means the worker processes at most 1 job per `MIN_SEND_DELAY_MS` milliseconds, creating a guaranteed minimum gap between sends at the worker level. default is 500ms. with concurrency > 1, the effective throughput is `concurrency / MIN_SEND_DELAY_MS` jobs per second, but each individual job still has the minimum gap enforced by the queue.

### handling 1000+ emails at the same time

scheduling 1000 emails for the same start time creates 1000 individual bullmq delayed jobs with `delay = 0`. they all land in the wait queue simultaneously. the worker processes them at its configured concurrency and rate. the rate limiting logic prevents burst delivery — if the hourly cap is 1000, exactly 1000 go out per hour, with the rest rescheduled. no data is lost; nothing crashes; postgres holds the full record.

### trade-offs and assumptions

- **worker in-process**: by default the worker starts inside the api process (`npm run dev`). this is convenient for local dev but in production you'd run `npm run worker` separately so api and worker can scale independently.
- **jwt, not sessions**: stateless auth means no session store needed. downside is tokens can't be invalidated before expiry (7 days). for this use case that's fine.
- **ethereal account creation at startup**: two ethereal accounts are created if none exist. in a real app you'd configure senders manually or via an admin ui.
- **no websocket/sse**: the dashboard polls every 15 seconds for status updates. for a production product you'd want server-sent events or webhooks to push updates.
- **prisma**: chosen for typescript-first dx and clean migration workflow. drizzle would be lighter but prisma's type generation is hard to beat for rapid prototyping.
- **single queue**: all email jobs share one bullmq queue. for very high volume you might shard by sender or priority.

---

## feature checklist

### backend
- [x] scheduling api (`POST /api/emails/schedule`)
- [x] batch insert into postgres
- [x] bullmq delayed jobs (no cron, no node-cron)
- [x] ethereal smtp sending with preview urls
- [x] multiple senders (seeded from ethereal, stored in db)
- [x] restart persistence (jobs in redis, deterministic job ids)
- [x] idempotency (status check before send, bullmq dedup by job id)
- [x] configurable worker concurrency (`WORKER_CONCURRENCY`)
- [x] minimum delay between sends (`MIN_SEND_DELAY_MS` via bullmq limiter)
- [x] global hourly rate limit (`MAX_EMAILS_PER_HOUR`)
- [x] per-sender hourly rate limit (`MAX_EMAILS_PER_HOUR_PER_SENDER`)
- [x] per-batch hourly cap (optional, set in compose modal)
- [x] redis-backed rate counters (lua script, safe for multi-worker)
- [x] reschedule to next hour on rate limit (no dropped jobs)
- [x] handles 1000+ simultaneous jobs correctly

### frontend
- [x] google oauth login (real, not mocked)
- [x] redirect to dashboard after login
- [x] header with name, email, avatar, logout
- [x] dashboard with "scheduled emails" and "sent emails" tabs
- [x] compose new email button
- [x] compose modal: subject, body, sender selector
- [x] csv/txt upload with client-side email parsing and count display
- [x] start time, delay between emails, hourly limit fields
- [x] schedule button with loading state
- [x] scheduled emails table with status badges, loading, empty states
- [x] sent emails table with ethereal preview links, loading, empty states
- [x] pagination
- [x] error toasts
- [x] typescript types throughout
