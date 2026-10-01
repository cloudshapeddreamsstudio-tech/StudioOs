# AGENTS.md — start here

You are reading the router for this codebase. It tells you what StudioOS is,
where the files sit, which documents to trust, and the three rules that must
survive whatever you are about to change.

It is written for two readers at the same time: an AI agent that starts a
session with no memory of this repository, and a person who has not worked here
before. Both need the same map, so there is one map.

**If you read one section, read [The three questions](#the-three-questions).**

### If you are an agent, starting a session

Read this file. Then read, in this order, only what your task needs:

1. `docs/tasks/<the card you were given>.md` — if you were given one. It names
   what to read next.
2. `docs/SEAM.md` section 10 — the three questions. Answer them for your change.
3. `docs/HANDOFF.md` — the current direction, if no card was given.

Then work. Do not read the whole `docs/` folder. `docs/PLAN-v2.md` is 1200 lines
of history and you almost never need it.

Two rules that apply to each session:

- **When a document and a running machine disagree, the machine is correct.**
  Fix the document in the same change, and say what you observed. This has
  already happened one time in this repository, and the document was wrong.
- **State what you decided not to do.** A reader cannot find that later.

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
  src/kernel/auth/     sessions: the only code that reads or writes them
  src/db/              the parked ledger schema and client - not used today
  migrations/          the D1 migrations that are applied
  migrations-parked/   the old ledger migrations - never applied
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
the old ledger tables. D1 is bound, but those tables do not exist in it: their
migrations are in `worker/migrations-parked/` and are not applied. A parked
route that is mounted fails on its first query. They are finished work that
waits for its phase. **Do not mount one without doing its phase.**

They are type-checked. The `exclude` list in `worker/tsconfig.json` was
deleted at H2, when D1 was bound again. **Do not add one back.**

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
| `docs/HANDOFF.md` | **Authoritative** | The work ahead, in order, and the decisions inside each piece. Start here if you are new. `docs/handoff.html` is the same document with diagrams. |
| `docs/tasks/` | **Authoritative** | One card for one job, written to be given to an agent. See `docs/tasks/README.md`. |
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

One process, one port, one origin. The Worker serves the SPA and runs the API
on the same port. Production is the same.

**Bun is the toolchain. It is not the runtime.** Bun installs, tests, and starts
the development server. The Worker itself always runs in `workerd`, which is the
Cloudflare Workers runtime, on your machine and in production. So write code for
`workerd`: there is no `node:fs`, and a Node API works only when
`nodejs_compat` allows it. The `worker/scripts/` files are the one exception.
They run in Bun, on a real file system, and never inside the Worker.

```bash
bun install          # once, from the repository root
bun run db:migrate   # once, and after each new migration

bun run dev          # daily work: http://localhost:8787, hot reload
bun run start        # what production does: build, then run that build
```

Both use port 8787, which is one origin, so run one at a time.

- `bun run dev` is Vite with `@cloudflare/vite-plugin`. The Worker runs inside
  the Vite server, in `workerd`. A change in `app/src/` appears in the browser
  with no build. A change in `worker/src/` reloads the Worker.
- `bun run start` runs `vite build`, then `vite preview`. That is the bundle
  that production deploys. Use it to test what production does.
- `bun run dev:api` runs only the Worker, with `wrangler dev`, on the last
  build of the SPA. It is not the production bundle.

[ADR-0004](./docs/adr/0004-the-development-loop.md) gives the reasons, and the
two settings in `app/vite.config.ts` that must not go: `configPath` and
`persistState`.

To check the routing between the SPA and the Worker, run
`bun run worker/scripts/check-one-origin.ts` against `bun run dev` and against
`bun run start`. The two must agree. To check that a session can be cancelled,
read the top of `worker/scripts/check-session-cancel.ts`.

If sign-in fails with `no such table: studio`, you did not run
`bun run db:migrate`.

On Windows, `scripts/dev.cmd` is `bun run dev`, and `scripts/dev-worker.cmd` is
`bun run start`. Read `scripts/README.md` first if you use WSL. Where you keep
the repository changes which method is correct.

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
bun run check        # typecheck both sides, then run the tests
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
- **Correct a document in the same change that proves it wrong.** Do not work
  around a document that does not match the machine, and do not leave the fault
  for the next person. `worker/scripts/check-one-origin.ts` exists because of
  one of these, and `docs/SEAM.md` section 8 was corrected from it.
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
| Sessions are a small store in D1 that StudioOS writes, not better-auth | [ADR-0003](./docs/adr/0003-how-sessions-are-stored.md) |
| The development loop. `wrangler.jsonc` stays in `worker/` | [ADR-0004](./docs/adr/0004-the-development-loop.md) |
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
| ~~H1~~ | ~~One Worker and one origin.~~ **Done 2026-10-01.** |
| ~~H1b~~ | ~~A fast development loop, still on one origin.~~ **Done 2026-10-01**, [ADR-0004](./docs/adr/0004-the-development-loop.md). |
| ~~H2~~ | ~~Sessions that can be cancelled, on D1.~~ **Done 2026-10-01**, [ADR-0003](./docs/adr/0003-how-sessions-are-stored.md). Still only tested on a local Worker; real D1 is tested at deployment. |
| H2b | Sign out everywhere, and remove a person from a studio. [Card](./docs/tasks/h2b-sign-out-everywhere.md). |
| H3 | The front end conventions and the Figma pipeline. Runs beside H1 and H2. |
| then | The modules in ADR-0002, continuous integration, project notes, deployment. |

H1 comes before H2. Do not start H2 first. H3 touches no Worker code, so it can
run at any time.

---

## Where this file goes next

Today there is one `AGENTS.md`. After M2 divides the Worker into modules, each
module gets its own short `AGENTS.md`. It names what the module owns, which
ERPNext DocTypes it touches, and its rules. Those are the reminders that arrive
at the correct time, because you read them when you are already in the folder.

This file stays the router. Keep it short enough that to read it is never the
expensive part of starting work.
