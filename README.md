# Allo Inventory — Take-Home Exercise

A Next.js inventory-reservation platform for multi-warehouse retail. Customers can place a timed hold on stock at checkout; the hold expires automatically if payment isn't confirmed.

**Live URL:** `https://allo-inventory.vercel.app` _(replace after deploy)_

---

## Running locally

### Prerequisites

- Node 20+
- A hosted Postgres instance (Supabase, Neon, or Railway — **not SQLite**)
- Optional: an Upstash Redis instance (idempotency works in degraded mode without it)

### Steps

```bash
# 1. Clone and install
git clone https://github.com/you/allo-inventory.git
cd allo-inventory
npm install

# 2. Environment variables
cp .env.example .env.local
# Fill in DATABASE_URL, DIRECT_URL, and optionally UPSTASH_* variables

# 3. Run migrations and generate the Prisma client
npm run db:generate
npx prisma migrate deploy   # or: npx prisma db push (for dev without migrations)

# 4. Seed the database
npm run db:seed

# 5. Start the dev server
npm run dev
# → http://localhost:3000
```

### Environment variables

| Variable | Required | Purpose |
|---|---|---|
| `DATABASE_URL` | ✅ | Pooled Postgres connection (PgBouncer-compatible) |
| `DIRECT_URL` | ✅ | Direct Postgres connection for Prisma migrations |
| `UPSTASH_REDIS_REST_URL` | Optional | Idempotency key cache |
| `UPSTASH_REDIS_REST_TOKEN` | Optional | Idempotency key cache |
| `CRON_SECRET` | Optional | Authenticates Vercel Cron calls in production |

---

## Architecture

### Data model

```
Product ──< Stock >── Warehouse
   │                    │
   └──── Reservation ───┘
```

- **Stock** is the join table between Product and Warehouse. It carries two counters:
  - `totalUnits`: physical units in that warehouse.
  - `reservedUnits`: units currently held by PENDING reservations.
  - `available` is derived: `totalUnits − reservedUnits`. It is _not_ stored; deriving it avoids a third counter that could drift.

- **Reservation** has three terminal statuses:
  - `PENDING` → hold is active, timer running
  - `CONFIRMED` → payment succeeded, units permanently sold
  - `RELEASED` → hold expired or user cancelled

When a reservation is **confirmed**, both `totalUnits` and `reservedUnits` are decremented (units are gone). When it is **released**, only `reservedUnits` is decremented (units return to available pool).

---

## Concurrency: how the reservation logic is race-condition-free

This is the core of the exercise.

### The problem

A naive reserve flow looks like:

```
read stock    →  check available  →  write +1 reserved
```

Two concurrent requests can both read "1 unit available" before either has written, pass the check independently, and both write `+1`, leaving `reservedUnits = 2 > totalUnits = 1`. One customer gets a refund.

### The solution: pessimistic row locking (`SELECT … FOR UPDATE`)

The reservation is created inside a `prisma.$transaction` that begins by locking the relevant `Stock` row:

```sql
BEGIN;

-- Acquire exclusive row lock. Any other transaction touching this row
-- will block here until we COMMIT or ROLLBACK.
SELECT id, "totalUnits", "reservedUnits"
FROM "Stock"
WHERE "productId" = $1 AND "warehouseId" = $2
FOR UPDATE;

-- Check availability in application code
-- (available = totalUnits - reservedUnits)

-- If ok, increment
UPDATE "Stock"
SET "reservedUnits" = "reservedUnits" + $quantity
WHERE id = $stockId;

-- Create the reservation record
INSERT INTO "Reservation" (...)

COMMIT;
```

Postgres serialises concurrent `FOR UPDATE` acquisitions on the same row. The second request blocks until the first transaction commits, then reads the updated `reservedUnits` and correctly sees 0 available. It returns a 409; exactly one reservation is created.

### Why not optimistic locking?

Optimistic locking (version column + retry on conflict) works but degrades under high contention — N concurrent requests for the same last unit would all conflict, only one succeeds on the first try, and the rest retry. Under sustained load that's unpredictable latency. Pessimistic locking is predictably linear: requests queue, each waits at most the duration of one transaction (~a few ms), and no retries are needed.

### Why not a Redis distributed lock?

Redis Redlock is appropriate when you need cross-process locking for operations that span multiple data stores or can't use DB transactions. Here, the lock scope is a single Postgres row, so a DB-level lock is simpler, transactionally consistent, and doesn't introduce a second point of failure.

---

## Reservation expiry

### Production mechanism: Vercel Cron

`vercel.json` schedules `GET /api/cron/release-expired` to run every minute:

```json
{
  "crons": [{ "path": "/api/cron/release-expired", "schedule": "* * * * *" }]
}
```

The endpoint:
1. Queries for all `PENDING` reservations where `expiresAt < NOW()`.
2. For each, runs `releaseReservation(id)` which — inside a transaction with `FOR UPDATE` — decrements `reservedUnits` and sets status to `RELEASED`.
3. The `FOR UPDATE` inside `releaseReservation` prevents double-releases if the cron overlaps with a user-initiated cancel.

**Maximum staleness:** up to 1 minute. A customer landing on the product page just after a reservation expires might still see 0 available for up to 60 seconds. This is acceptable for the scope of this exercise.

### Alternative: lazy cleanup on read

The `GET /api/products` route could call `releaseExpiredReservations()` before computing available stock. I chose not to do this because:

- It adds latency to every product-list request.
- It's harder to reason about — a GET endpoint shouldn't have side effects by convention.
- The cron approach makes expiry a first-class background concern.

### Alternative: database-level TTL / pg_cron

In a production system I'd use `pg_cron` to run the cleanup directly in the database, eliminating the dependency on Vercel's cron infrastructure. Supabase supports `pg_cron` natively.

---

## Idempotency (bonus)

Both `POST /api/reservations` and `POST /api/reservations/:id/confirm` support the `Idempotency-Key` header.

### Implementation

1. Before processing, we check Redis for `idempotency:{namespace}:{key}`.
2. If found, we return the cached response immediately with `Idempotent-Replayed: true` header — no DB writes happen.
3. If not found, we process the request normally and store the response in Redis with a 24-hour TTL.

```
Client → POST /api/reservations
         Idempotency-Key: uuid-v4

Server:
  redis.get("idempotency:reservations:uuid-v4")
  → null                     (first request)
  → proceed, create, store
  → return 201

Client retries same key:
  redis.get("idempotency:reservations:uuid-v4")
  → cached payload           (replay)
  → return 200 (no DB write)
```

If Redis is unavailable, `checkIdempotency` returns `null` and the request is processed normally. This means idempotency degrades gracefully rather than failing hard — acceptable for this exercise, though in production you'd want to decide whether to fail closed.

The `idempotencyKey` is also stored on the `Reservation` row with a `@unique` constraint, so even if Redis is cold and two identical requests race, the DB constraint provides a backstop.

---

## API reference

| Method | Path | Status codes |
|---|---|---|
| `GET` | `/api/products` | 200 |
| `GET` | `/api/warehouses` | 200 |
| `POST` | `/api/reservations` | 201, 400, 404, 409 |
| `GET` | `/api/reservations/:id` | 200, 404 |
| `POST` | `/api/reservations/:id/confirm` | 200, 404, 409, 410 |
| `POST` | `/api/reservations/:id/release` | 200, 404, 409 |

**409 Conflict:** not enough stock available.  
**410 Gone:** reservation expired before confirm was called.

---

## Trade-offs and things I'd do differently

### What I'd do differently with more time

**Proper payment simulation.** Right now "Confirm purchase" is instant. A real checkout would involve a payment provider webhook — the confirm endpoint would be called by the webhook, not directly by the browser. The 10-minute window exists precisely to bridge the async payment flow.

**Reservation GET polling vs. WebSocket.** The countdown timer currently lives entirely in the client. If the server releases a reservation (e.g. via cron) while the user is looking at the checkout page, the UI doesn't know until they take an action. I'd add either:
- A short-poll on `GET /api/reservations/:id` every 30 seconds to sync server state.
- A server-sent event stream so the server can push the expiry event.

**Finer stock granularity.** The current model reserves at the warehouse level. A real system might reserve at the bin/aisle level to optimise pick-routing.

**Admin tooling.** There's no way to restock a warehouse or inspect active reservations via the UI. A simple `/admin` page would be valuable during a demo.

**Error recovery on confirm.** If the confirm transaction partially fails (stock decremented but reservation update failed), the stock counter is wrong. In practice this is extremely unlikely with Postgres ACID guarantees, but a reconciliation job that checks for CONFIRMED reservations where `totalUnits + reservedUnits` is inconsistent would add resilience.

**Metrics.** The cron job logs how many reservations it released but doesn't emit structured metrics. In production I'd push to Datadog or a structured log sink so we can track reservation conversion rates and expiry frequency.

### Explicit decisions / non-obvious choices

- **`reservedUnits` as a counter on Stock, not a COUNT query** — avoids a full-table scan on Reservations for every product-list render, at the cost of needing careful increment/decrement discipline. The `FOR UPDATE` lock maintains the invariant.
- **`GREATEST(..., 0)` in UPDATE statements** — defensive guard against the counter going negative from a bug or manual intervention; avoids a hard constraint violation.
- **Cron every minute, not every second** — Vercel Cron's minimum interval is 1 minute. The 10-minute window is generous enough that 1-minute staleness is fine.
- **`force-dynamic` on all API routes** — ensures Next.js never caches route responses, which would return stale stock counts.
