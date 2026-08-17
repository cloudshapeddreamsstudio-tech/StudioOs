# StudioOS — deployment runbook

Every command here is meant to be run in order, from a terminal, by a human
with access to the studio's Cloudflare account. Nothing in this file has been
executed — the account boundary is where automation stops.

**Prerequisites**

- A Cloudflare account (the free plan covers everything below at this scale).
- Node on PATH. `npx wrangler`, never `bunx wrangler` — Wrangler refuses to run
  under Bun's runtime.
- The ERPNext API key/secret pair, from ERPNext: avatar → My Settings →
  API Access → Generate Keys. **The secret is shown exactly once.**

> **One decision to make before step 6.** See "Routing" below — whether you have
> a custom domain changes how the SPA reaches the API, and it is much simpler
> with one.

---

## 1. Sign in

```bash
cd StudioOs/backend
npx wrangler login
```

Opens a browser. Verify with `npx wrangler whoami`.

## 2. Create the database

```bash
npx wrangler d1 create studioos-db
```

Copy the printed `database_id` into `wrangler.toml`, replacing
`REPLACE_WITH_ID_FROM_WRANGLER_D1_CREATE`. Commit that change.

## 3. Create the schema

```bash
npx wrangler d1 migrations apply studioos-db --remote
```

## 4. Import the ledgers — the step that must not be rushed

These six tables are the studio's **only** copy of studio rental sessions,
transactions, crew rosters, expenses, subscriptions and invoice branding.
ERPNext has none of it.

```bash
bun run scripts/import-ledgers.ts       # writes seed.sql, touches nothing
```

Read `seed.sql`. Then:

```bash
npx wrangler d1 execute studioos-db --remote --file=./seed.sql
bun run scripts/verify-ledgers.ts --remote
```

`verify-ledgers` compares row counts **and money totals** against the source
JSON and exits non-zero on any mismatch. Do not continue past a failure. As of
the last local run the expected figures are:

| Table | Rows | Total |
|---|---|---|
| expenses | 0 | — |
| crew_entries | 5 | ₹14,400 |
| subscriptions | 2 | — |
| transactions | 92 | ₹1,51,741 |
| rental_bookings | 2 | — |
| rental_sessions | 103 | ₹13,550 |
| brand | 1 | — |

## 5. Secrets

```bash
npx wrangler secret put FRAPPE_API_KEY
npx wrangler secret put FRAPPE_API_SECRET
```

These are prompted for, never written to a file. `FRAPPE_URL` and `COMPANY` are
plain vars already in `wrangler.toml`.

## 6. Create the backup bucket, then deploy the API

```bash
npx wrangler r2 bucket create studioos-backups
npx wrangler deploy
```

The deploy also registers the nightly cron (19:30 UTC = 01:00 IST). Verify:

```bash
curl https://studioos-api.<your-subdomain>.workers.dev/api/health
```

Expect `{"ok":true,"frappeConfigured":true,"dbBound":true}`. Then force one
backup rather than waiting a day for the cron:

```bash
curl -X POST https://studioos-api.<your-subdomain>.workers.dev/api/admin/backup
npx wrangler r2 object get studioos-backups/d1/studioos-<UTC-date>.json --file=/tmp/check.json
```

Backup keys are **UTC-dated**, matching the cron. Late evening IST writes
yesterday's date — that is correct, not a bug.

## 7. Deploy the front end

```bash
cd ../frontend
bun run build
npx wrangler pages deploy dist --project-name studioos
```

### Routing — the decision

The SPA calls `/api/*` as a same-origin relative path. That has to reach the
Worker.

**With a custom domain (recommended).** Add the domain to Cloudflare, point the
Pages project at `studioos.yourdomain.com`, then add a Worker route:

```
studioos.yourdomain.com/api/*  →  studioos-api
```

One origin, no CORS, and a single Access application protects everything.

**Without a custom domain.** Pages is on `*.pages.dev` and the Worker on
`*.workers.dev` — different origins. That needs CORS on the Worker, a build-time
API base URL in the frontend, and *two* Access applications kept in sync. It
works, but it is materially more to get wrong. Worth the price of a domain.

## 8. Put Cloudflare Access in front

Zero Trust → Access → Applications → Add a self-hosted application.

- Domain: the app's hostname (and the API hostname too, if you skipped step 7's
  custom domain).
- Policy: **Allow**, rule type **Emails**, listing exactly the addresses that
  should get in.
- Leave session duration at the default.

This is the whole authentication story. There is no login page in the app, no
password handling, and no user table — by design. Confirm it works from a
private window: you should be challenged before seeing anything.

## 9. Prove it end to end

- `/api/health` reports both flags true.
- The Projects page lists real projects.
- An invoice's Print view renders with the UPI QR.
- `verify-ledgers.ts --remote` passes.
- A private window is challenged by Access.

## Rollback

Every deploy is versioned:

```bash
npx wrangler deployments list
npx wrangler rollback [<deployment-id>]
```

Rollback reverts **code only**. It does not undo a D1 migration or a seed
import — those are forward-only, which is exactly why step 4 has its own
verification gate.

## After deploying

The old app keeps running until parity is confirmed (Phase 6). Do not switch it
off, and do not let both write to the same ledgers at once — StudioOS writes to
D1, the old app writes to its JSON files, and nothing reconciles them.
