# AGENTS.md — start here

You are reading the router for this codebase. It tells you what StudioOS is,
where things sit, which documents to trust, and the three rules that must
survive whatever you are about to change.

It is written for two readers at once: an AI agent starting a session with no
memory of this repo, and a human engineer who has not been here before. Both
need the same map, so there is only one.

**If you read nothing else, read [The three questions](#the-three-questions).**

---

## What StudioOS is

A studio operations app for video production studios, built on top of each
studio's own ERPNext. Projects, clients, invoices, tasks, crew, money views.

It exists because ERPNext's own interface has a steep learning curve for a
cinematographer who just wants to see a project. StudioOS is the presentation
layer. ERPNext is the system of record and stays that way.

Two consequences follow, and everything else in this file comes from them:

- StudioOS is a **wrapper**, not a database. If it disappears tomorrow, the
  studio's books are untouched and the accountant keeps working.
- StudioOS holds **no credential** that can read a studio's accounts. Every
  read and write runs on the signed-in person's own ERPNext token.

---

## The three questions

Ask these for every new field, table, endpoint and migration. They are from
`docs/SEAM.md` section 10, which is the constitution of this repo.

1. **Does this data survive deleting StudioOS?**
   Yes → it belongs in ERPNext. No → it belongs in D1.

2. **Does reading this data reveal something about an ERPNext document?**
   Yes → wrap the read in `withDocAccess`, which asks ERPNext first and lets
   ERPNext's 403/404 be your 403/404.

3. **Does this need a credential when no user is present?**
   Yes → **stop.** The design is wrong. Do not add a service account, an API
   key, or a "just for the cron job" token. Change the design instead.

Question 1 answers most decisions on its own. Questions 2 and 3 exist because
their failures produce no error message: nothing crashes, nothing logs, and the
wrong person sees the right data.

> The sentence that breaks this codebase is *"we just need a service account
> for this one task."* If you find yourself writing it, stop and ask.

---

## Where sits what

```
AGENTS.md              this file - the router
README.md              the shortest true description of the project
docs/                  the documents, see "Which documents to trust"
backend/               Hono API on Cloudflare Workers  (becomes worker/ at M2)
  src/index.ts         the route table - read this first, it is the map
  src/routes/          one file per endpoint group
  src/lib/             pure logic + the ERPNext client + session + tenants
  src/middleware/      requireSession, errorHandler
  src/schemas/         zod input validation
  src/db/              D1 schema and client (currently unbound, see below)
  tests/               bun test, pure-logic only, no network
  wrangler.toml        Worker config, bindings, vars
frontend/              React 19 + Vite SPA  (becomes app/ at M2)
  src/features/<name>/ a feature owns its pages + its api.ts + its types
  src/components/      layout and shared UI only
  src/lib/api.ts       the single fetch wrapper - do not hand-roll fetch
scripts/               Windows .cmd dev helpers, see "Running it locally"
```

### The route table is the real index

`backend/src/index.ts` mounts every live endpoint and carries a comment
explaining what is deliberately **not** mounted. Read it before grepping.

Five route files exist but are unmounted on purpose: `brand`,
`projectExpenses`, `studioRental`, `subscriptions`, `transactions`. They read
D1, and D1 is not bound yet. They are finished work parked until the seam says
where that data lives. **Do not re-mount one without doing its phase.**

Those same files plus `db/client.ts`, `db/schema.ts` and `lib/backup.ts` are
listed in `backend/tsconfig.json`'s `exclude`, so they are not type-checked.
That list is technical debt with a timer on it: excluded code rots silently.
It goes away at M4 when D1 returns.

### Frontend and backend names should match

A feature called `projects` should exist under both `frontend/src/features/` and
(after M2) `worker/src/modules/`. One word takes you to both halves. If you add
a feature on one side, use the same word on the other.

---

## Which documents to trust

| Document | Status | Use it for |
|---|---|---|
| `docs/SEAM.md` | **Authoritative** | Where data lives, who grants access. Amendments at the bottom. |
| `docs/seam-map.html` | **Authoritative** | The same document as diagrams. Open it when the prose is dense. |
| `docs/SPEC.md` | **Authoritative** | The goal, the non-goals, and two sections of verified live findings. |
| `docs/PLAN-v2.md` | **Plan of record** | Phases 6 to 11, what is done and what is open. Long. Grep by phase. |
| `docs/DEPLOY.md` | **STALE - do not follow** | Nothing. It describes the pre-Phase-6c architecture. Rewritten at M6. |
| `docs/archive/` | **History** | Understanding why something is the way it is. Never as instruction. |

When SEAM.md and any other document disagree, SEAM.md wins, and the
disagreement is a bug in the other document. Report it rather than picking one.

---

## Running it locally

Two processes. The SPA proxies `/api` and `/auth` to the Worker, so the browser
stays on one origin, which is what production will do too.

```bash
cd backend  && bun install && bun run dev   # the API on :8787
cd frontend && bun install && bun run dev   # the SPA on :5173
```

- **Never `bunx wrangler`.** Wrangler refuses to run *as* Bun's runtime and
  fails with a confusing error. `bun run dev` is fine, because the package
  script shells out to Wrangler's own node binary. When invoking Wrangler
  directly, use `npx wrangler`.
- Copy `backend/.dev.vars.example` to `backend/.dev.vars` and generate the three
  keys it describes. `.dev.vars` is gitignored twice over, deliberately.
- `GET /api/health` answers `{ok, registryBound, appOrigin}` without
  credentials. If it reports `registryBound: false`, the KV binding is missing.
- The `scripts/*.cmd` helpers are Windows-only and hardcode an absolute path
  from one machine. They work for whoever wrote them and nobody else.

```bash
cd backend && bun test        # 165 tests, pure logic, no network
cd backend && bun run typecheck
```

Both must pass before a PR. `typecheck` currently skips eight files - see the
`exclude` note above, and do not add to that list.

---

## Conventions that are not up for debate

Each one exists because breaking it caused a real problem or would cause a
silent one.

- **Every D1 row that points at an ERPNext document carries three columns:**
  `studio_id`, `erp_doctype`, `erp_name`. Every index on them starts with
  `studio_id`. Leave it out and you have written a cross-tenant read that
  returns 200. `PROJ-0042` exists on every customer's site.
- **Never copy ERPNext field values into D1.** Not `status`, not `grand_total`,
  not "just for the list page". Two sources means one is wrong and the client
  is the one who finds out. Keep the reference, read the value.
- **A cache table is named `cache_`, has a `fetched_at`, and is never joined as
  truth.** If something writes to it, it is not a cache. Rename it or delete it.
- **Invoices are created as DRAFT.** Submitting is a separate, deliberate call.
  Accounts are read from the studio's own Company record, never named in code.
- **Errors are thrown, not caught per route.** `app.onError` handles them once
  in `middleware/errorHandler.ts`. A route with its own try/catch is a smell.
- **ERPNext must not know StudioOS exists.** No custom fields on stock
  doctypes. (Whether StudioOS may create its *own* custom DocTypes is a
  different question and currently open - see Open decisions.)
- **`APP_ORIGIN` is effectively frozen.** The OAuth redirect URI is built from
  it and registered on every customer's ERPNext. Changing it later means every
  customer reinstalls the connector.

---

## Things that look like good ideas here and are not

Read this list when you are about to be clever.

- Adding a permission check in StudioOS. There is no permission code in this
  backend and that is the design. ERPNext decides.
- Caching a user's projects "to make the dashboard fast". See the cache rules.
  Then check whether it actually needs to be fast.
- A cron job that emails clients about overdue invoices. It has no user, so it
  has no token, so it cannot read invoices. ERPNext sends money email.
- Sending an invoice from StudioOS. Two senders, two audit trails, one split
  domain reputation. Trigger ERPNext's own send instead.
- Storing the ERPNext access token in the cookie. It becomes unrevocable.
- Re-mounting one of the five parked routes because "it already works".
- A `FRAPPE_API_KEY` env var. If you are reaching for one, question 3 said stop.

---

## How to make a change

1. Read `docs/SEAM.md` §10 and answer the three questions out loud, in the PR.
2. Find the feature's existing home. Same word on both sides of the stack.
3. Write the smallest change that works. Simplicity is the constraint, not the
   aspiration: if the diff is growing a framework, you are solving the wrong
   problem.
4. Add a test if the logic is pure. Do not add a test that hits the network.
5. `bun run typecheck && bun test` before opening the PR.
6. In the PR, say what you did **and what you decided not to do.** The second
   one is what a reviewer cannot reconstruct later.

---

## For Sandesh

You are steering. The agent types faster than you, so your job is the part it
cannot do: deciding whether the thing being built should exist in that shape.

**Stop and ask when:**

- The answer to question 3 is yes. Always. No exceptions, no workarounds.
- SEAM.md and what you are building disagree. The document might be wrong -
  that has already happened once, see its Amendments - but that is a decision
  to be taken deliberately, in writing, not routed around in code.
- The change touches `routes/auth.ts`, `lib/tenants.ts`, or `APP_ORIGIN`.
  Those are frozen surfaces with customer-visible consequences.
- You are about to add a dependency. Ask what it saves and what it costs.
- The agent produces something that works and you cannot explain why. Working
  code you cannot explain is a liability with a delay fuse.

**Good questions look like:** "SEAM says expenses go to ERPNext as a Purchase
Invoice, but that needs a Supplier and this studio's expenses have none. Which
gives?" Bad questions look like "is this right?" - name the tension.

**A habit worth building:** before you accept a diff, ask the agent *"which of
the three questions does this touch, and what did you decide?"* If it cannot
answer, neither can you, and the change is not ready.

---

## Open decisions

These are live. Do not guess them, and do not let an agent settle them quietly.

| Question | Owner | Blocks |
|---|---|---|
| May StudioOS provision its own custom DocTypes on a studio's site? | Malhar | Project expenses, overheads |
| Overheads/subscriptions: native `Subscription` or a light provisioned DocType? | Shubham | Phase 10g |
| The production hostname, which fixes `APP_ORIGIN` forever | Malhar | M1, one origin |
| Repo layout: rename `backend/`+`frontend/` to `worker/`+`app/`? | Malhar | M2 |
| Do changes land via PR review, or straight to main? | Malhar | M3, CI |

---

## Where this file is going

Today there is one AGENTS.md. After M2 splits the backend into modules, each
module gets its own short `AGENTS.md` naming what it owns, which ERPNext
doctypes it touches, and its invariants. Those are the timely reminders: they
load when you are already in the folder, not all at once at the start.

This file stays the router. Keep it short enough that reading it is never the
expensive part of starting work.
