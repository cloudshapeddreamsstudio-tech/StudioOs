# AGENTS.md — start here

You are reading the router for this codebase. It tells you what StudioOS is,
where the files sit, which documents to trust, and the three rules that must
survive whatever you are about to change.

It is written for two readers at the same time: an AI agent that starts a
session with no memory of this repository, and a person who has not worked here
before. Both need the same map, so there is one map.

**If you read one section, read [The three questions](#the-three-questions).**

---

## What StudioOS is

A studio operations application for video production studios. It runs on top of
each studio's own ERPNext. It shows projects, clients, invoices, tasks, crew and
the money views.

It exists because the ERPNext interface has a steep learning curve for a
cinematographer who wants to see one project. StudioOS is the presentation
layer. ERPNext is the system of record, and it stays that way.

Two results follow, and the rest of this file comes from them.

- StudioOS is a **wrapper**, not a database. Delete it tomorrow and the
  studio's books are unchanged. The accountant continues to work.
- StudioOS holds **no credential** that reads a studio's accounts. Each read and
  each write runs on the token of the person who signed in.

---

## The three questions

Ask these for each new field, table, endpoint and migration. They are from
`docs/SEAM.md` section 10, which is the constitution of this repository.

1. **Does this data stay if you delete StudioOS?**
   Yes: it goes in ERPNext. No: it goes in D1.

2. **Does a read of this data show information about an ERPNext document?**
   Yes: put the read inside `withDocAccess`. That function asks ERPNext first,
   and lets the 403 or 404 from ERPNext be your 403 or 404.

3. **Does this need a credential when no user is present?**
   Yes: **stop.** The design is wrong. Do not add a service account, an API key,
   or a token "only for the scheduled job". Change the design.

Question 1 answers most decisions alone. Questions 2 and 3 exist because their
failures give no error message. Nothing stops, nothing writes a log, and the
wrong person sees the correct data.

> The sentence that breaks this codebase is *"we only need a service account for
> this one task"*. If you write that sentence, stop and ask.

---

## Where the files are

```
AGENTS.md              this file - the router
README.md              the shortest true description of the project
package.json           the Bun workspace and the root scripts
app/                   the SPA: React 19, Vite, TypeScript, Tailwind v4
  src/features/<name>/ a feature owns its pages, its api.ts and its types
  src/components/      layout and shared interface elements only
  src/lib/api.ts       the one fetch wrapper - do not write fetch by hand
worker/                the Worker: Hono on Cloudflare Workers
  wrangler.jsonc       the Worker configuration, bindings and vars
  src/index.ts         the route table - read this first, it is the map
  src/routes/          one file for each group of endpoints
  src/lib/             pure logic, the ERPNext client, session, tenants
  src/middleware/      requireSession, errorHandler
  src/schemas/         zod input validation
  src/db/              the D1 schema and client - not bound today
  tests/               bun test, pure logic, no network
docs/                  see "Which documents to trust"
  adr/                 architecture decision records
scripts/               Windows and WSL helpers - see scripts/README.md
```

**One file must not be deleted: `worker/seed.sql`.** It is the only copy in this
repository of the studio's rental sessions, theatre ledger, crew roster,
expenses, subscriptions and invoice branding. ERPNext holds none of it. The
script that made it reads a different repository that is not on every machine,
so you cannot always make the file again. The file itself says this at the top.

`worker/` and `app/` are named for what Cloudflare deploys. They were
`backend/` and `frontend/`, which described a two-server architecture that this
application does not have. See
[ADR-0002](./docs/adr/0002-repository-structure.md).

### The route table is the real index

`worker/src/index.ts` mounts each live endpoint. It also has a comment that
says what is **not** mounted and why. Read it before you search the folder.

Five route files exist and are not mounted, on purpose: `brand`,
`projectExpenses`, `studioRental`, `subscriptions` and `transactions`. They read
D1, and D1 is not bound yet. They are finished work that waits for its phase.
**Do not mount one without doing its phase.**

Those files, and `db/client.ts` and `db/schema.ts`, are in the `exclude` list in
`worker/tsconfig.json`. They are not type-checked. That list
is debt with a date on it: code that is not checked decays quietly. The list is
deleted at M4. **Do not add to it.**

### The same word on both sides

A feature that is called `projects` exists in `app/src/features/` and, after M2,
in `worker/src/modules/`. One word takes you to both halves. If you add a
feature on one side, use the same word on the other side.

---

## Which documents to trust

| Document | Status | Use it for |
|---|---|---|
| `docs/SEAM.md` | **Authoritative** | Where data lives and who grants access. Read the Amendments at the end. |
| `docs/seam-map.html` | **Authoritative** | The same document as diagrams. Open it when the words are dense. |
| `docs/adr/` | **Authoritative** | One decision for each record, with its evidence and its cost. |
| `docs/HANDOFF.md` | **Authoritative** | The work ahead, in order, and the decisions inside each piece. Start here if you are new. |
| `docs/SPEC.md` | **Authoritative** | The goal, the non-goals, and two sections of verified live findings. |
| `docs/PLAN-v2.md` | **The plan of record** | Phases 6 to 11. It is long. Search it by phase number. |
| `docs/DEPLOY.md` | **STALE. Do not follow it.** | Nothing. It describes the architecture before Phase 6c. It is rewritten at M6. |
| `docs/archive/` | **History** | To learn why something is the way it is. Never as an instruction. |

If `docs/SEAM.md` and a different document disagree, SEAM is correct and the
other document has a fault. Report the fault. Do not choose one and continue.

---

## Write documentation in Simplified Technical English

**Each ADR, and each document in `docs/`, is written in ASD-STE100 Simplified
Technical English.** This is a rule, not a preference.

The reason is that these documents instruct machines and people at the same
time. When each word has one meaning, every model and every reader gets the
same instruction. `docs/SEAM.md` is the example to follow.

The rules that do most of the work:

- Write short sentences. Use a maximum of 20 words in one sentence.
- Give each word one meaning. Do not write `support`, `handle`, `leverage`,
  `robust` or `seamless`. Write what the thing does.
- Use the active voice. Write "the Worker reads the token", not "the token is
  read".
- Use one paragraph for one topic.
- Do not use two names for one thing. If it is `withDocAccess` on one page, it
  is `withDocAccess` on every page.
- Do not use humour, metaphor or idiom.

`docs/adr/README.md` has the full rule and the template. Code comments and
commit messages are not held to this rule, but they are better when they follow
it.

---

## Running it

Two processes. The SPA sends `/api` and `/auth` to the Worker, so the browser
stays on one origin. Production will do the same after M1.

**Bun is the toolchain. It is not the runtime.** Bun installs, tests, and starts
the development server. The Worker itself always runs in `workerd`, which is the
Cloudflare Workers runtime, on your machine and in production. So write code for
`workerd`: there is no `node:fs`, and a Node API works only when
`nodejs_compat` allows it. The `worker/scripts/` files are the one exception.
They run in Bun, on a real file system, and never inside the Worker.

```bash
bun install          # once, from the repository root

bun run dev:api      # terminal one, the Worker on :8787
bun run dev:app      # terminal two, the SPA on :5173
```

On Windows, `scripts/dev-worker.cmd` and `scripts/dev-app.cmd` do the same
thing. Read `scripts/README.md` first if you use WSL. Where you keep the
repository changes which method is correct.

- **Bun is the only tool you need.** Bun installs the packages, runs the
  scripts, runs the tests, and starts Wrangler. There is no `npm` and no `npx`
  in this repository. The version is pinned in `package.json` and in
  `.bun-version`.
- **Older notes say "never `bunx wrangler`". That is no longer true.** Wrangler
  refused the Bun runtime in the past. It does not refuse it now, and
  `bunx wrangler dev` was tested against this Worker. If you find that sentence
  in a document, the document is old.
- Copy `worker/.dev.vars.example` to `worker/.dev.vars`. Generate the three keys
  that the example file describes. `.dev.vars` is in two ignore files, on
  purpose.
- `GET /api/health` answers `{ok, registryBound, appOrigin}` and needs no
  credential. If `registryBound` is false, the KV binding is missing.

```bash
bun run check        # typecheck both sides, then run 165 tests
```

Both must pass before you commit.

---

## The conventions that are not open for discussion

Each one exists because it stopped a real problem, or because it stops a silent
one.

- **A D1 row that points at an ERPNext document has three columns:**
  `studio_id`, `erp_doctype`, `erp_name`. Each index on them starts with
  `studio_id`. Leave it out and you have written a cross-tenant read that
  returns 200. `PROJ-0042` exists on the site of each customer.
- **Do not copy an ERPNext value into D1.** Not `status`, not `grand_total`, not
  "only for the list page". Two sources means one is wrong, and the client is
  the person who finds out. Keep the reference. Read the value.
- **A cache table is named `cache_`, has a `fetched_at` column, and is never
  joined as truth.** If something writes to it, it is not a cache. Rename it or
  delete it.
- **An invoice is created as a DRAFT.** To submit it is a separate and
  deliberate call. Each account is read from the studio's own `Company` record.
  Do not name an account in the code.
- **Throw errors. Do not catch them in a route.** `app.onError` handles each one
  time, in `middleware/errorHandler.ts`. A route with its own try/catch is a
  fault.
- **ERPNext must not depend on StudioOS.** Tier 1, use a DocType that ERPNext
  ships. Tier 2, a custom field on a DocType that ERPNext ships, is forbidden in
  version 1. Tier 3, a DocType that StudioOS owns and provisions, is permitted
  under six conditions. Read
  [ADR-0001](./docs/adr/0001-studioos-provisions-its-own-doctypes.md) before you
  create one.
- **`APP_ORIGIN` is configurable, and the copies of it are not.** The OAuth
  redirect URI is built from it and is registered on the ERPNext site of each
  customer. Change it freely until the first customer connects. After that day,
  a change means each customer installs the connector again.

---

## Ideas that look correct here and are not

Read this list when you are going to be clever.

- A permission check written in StudioOS. This backend has no permission code,
  and that is the design. ERPNext decides.
- A cache of the user's projects "to make the dashboard fast". Read the cache
  rules. Then find out if it must be fast.
- A scheduled job that emails clients about late invoices. It has no user, so it
  has no token, so it reads no invoice. ERPNext sends the money email.
- An invoice sent from StudioOS. That gives two senders, two audit records, and
  one divided domain reputation. Start the ERPNext send function instead.
- The ERPNext access token in the cookie. You then cannot cancel it.
- One of the five parked routes, mounted "because it already works".
- A `FRAPPE_API_KEY` variable. If you want one, question 3 said stop.
- A second custom DocType, before the first one has run for one month.

---

## How to make a change

1. Read `docs/SEAM.md` section 10. Answer the three questions in the commit
   message or the pull request.
2. Find the existing home of the feature. The same word is used on both sides.
3. Write the smallest change that works. Simplicity is the constraint, not the
   goal. If the change starts to build a framework, you are solving a different
   problem.
4. Add a test if the logic is pure. Do not add a test that uses the network.
5. Run `bun run check`.
6. Say what you did, **and what you decided not to do**. A reader cannot
   reconstruct the second one later.

---

## For Sandesh

You steer. The agent writes faster than you, so your work is the part it cannot
do: to decide if the thing that is being built must exist in that shape.

**Stop and ask when:**

- The answer to question 3 is yes. Each time. There is no exception.
- `docs/SEAM.md` and the thing you build disagree. The document can be wrong.
  That has happened one time, and its Amendments record it. But that is a
  decision that you take in writing. Do not go around it in the code.
- The change touches `routes/auth.ts`, `lib/tenants.ts` or `APP_ORIGIN`. Those
  are frozen surfaces with effects that a customer sees.
- You are going to add a dependency. Ask what it saves and what it costs.
- The agent gives you code that operates, and you cannot say why. Code that
  operates and that you cannot explain is a fault with a delay on it.

**A good question names the tension.** "SEAM says that expenses go to ERPNext as
a Purchase Invoice, but that needs a Supplier, and these expenses have none.
Which rule gives way?" A question like "is this correct?" gives the agent no
information.

**A habit to build.** Before you accept a change, ask the agent: *"which of the
three questions does this touch, and what did you decide?"* If it cannot answer,
you cannot either, and the change is not ready.

---

## Decisions

Settled, and recorded:

| Decision | Record |
|---|---|
| StudioOS may provision its own DocTypes, under six conditions | [ADR-0001](./docs/adr/0001-studioos-provisions-its-own-doctypes.md) |
| The repository structure, and the module plan for M2 | [ADR-0002](./docs/adr/0002-repository-structure.md) |
| Documentation is written in Simplified Technical English | `docs/adr/README.md` |
| Changes go straight to `main` for now. Pull request review starts when Sandesh chooses | — |

Still open. Do not guess these, and do not let an agent settle one quietly:

| Question | Owner | Blocks |
|---|---|---|
| Overheads: a native `Subscription`, or a DocType that StudioOS provisions? | Shubham | Phase 10g |
| The production subdomain under `cloudshapeddreamsstudio.com` | Malhar | nothing today. `APP_ORIGIN` is free to change until the first customer connects. See `docs/PLAN-v2.md` D3 |

---

## The work ahead

`docs/HANDOFF.md` holds the current plan, in order, with the decisions inside
each piece.

| Work | What it does |
|---|---|
| H1 | One Worker and one origin. Static assets, `run_worker_first`, Wrangler 4. |
| H2 | better-auth on D1. The ERPNext tokens move into the `account` table. |
| H3 | Sign in with Google, and the studio connection step it needs. |
| H4 | The front end conventions and the Figma pipeline. Runs beside H1 to H3. |
| then | The modules in ADR-0002, continuous integration, project notes, deployment. |

H1 to H3 are in order. Do not start one before the previous one is finished. H4
touches no Worker code, so it can run at any time.

---

## Where this file goes next

Today there is one `AGENTS.md`. After M2 divides the Worker into modules, each
module gets its own short `AGENTS.md`. It names what the module owns, which
ERPNext DocTypes it touches, and its rules. Those are the reminders that arrive
at the correct time, because you read them when you are already in the folder.

This file stays the router. Keep it short enough that to read it is never the
expensive part of starting work.
