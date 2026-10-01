# 0002. The repository structure

- **Status:** Accepted
- **Date:** 2026-09-26
- **Owner:** Malhar
- **Changes:** `README.md`, `AGENTS.md`, every path in the documentation.
  Gives the specification for milestone M2.

## The question

StudioOS is one application that runs on Cloudflare. How do we arrange the
files so that a change to one part cannot break a different part, and so that a
new contributor finds the correct file quickly?

## Why the question is open

The Worker has approximately 7800 lines in a flat structure: 25 route files and
20 library files. Nothing prevents one route file from importing another.
Nothing shows a reader which files belong together.

Three facts control the answer.

- **Cloudflare wants one Worker and one origin.** Section 8 of `docs/SEAM.md`
  gives the reason. Two origins cause cookie errors and CORS errors that appear
  only in production.
- **Other people will contribute with an agent.** An agent does not hold the
  whole application in its context. It must be able to work inside one folder
  and be correct.
- **The seam must stay visible in the file system.** If a reader cannot see
  which code talks to ERPNext and which code talks to D1, the seam moves.

## The options

**A. One package, flat.** This is the structure today. It is simple to read for
a small application and it gives no boundary at all.

**B. One package, modules with a kernel.** Each domain gets a folder. The
folder holds its routes, its schemas, its service and its tests. A module
imports the kernel. A module never imports a different module.

**C. Many packages, one for each module.** Each module is a workspace package
with its own `package.json`. The boundary is enforced by the package manager.
It also adds a build step, version numbers, and work for each change.

## The decision

Use option B. One Worker, one SPA, a Bun workspace at the root.

### The structure now

```
AGENTS.md              the router - read this first
package.json           the Bun workspace and the root scripts
app/                   the SPA: React 19, Vite, Tailwind v4
  src/features/<name>/ a feature owns its pages, its api.ts and its types
  src/components/      layout and shared interface elements only
  src/lib/api.ts       the one fetch wrapper
worker/                the Worker: Hono on Cloudflare Workers
  wrangler.jsonc       the Worker configuration
  src/                 flat today, modules after M2
  tests/               bun test, pure logic, no network
docs/                  SEAM.md, SPEC.md, PLAN-v2.md, adr/, archive/
scripts/               Windows and WSL helpers
```

`backend/` is now `worker/`. `frontend/` is now `app/`. The names say what
Cloudflare deploys, not which half of the stack a file belongs to.

### The structure after M2

```
worker/src/
  index.ts             mounts the modules and does nothing else
  kernel/              the only code that a module may import
    frappe/            the ERPNext client and its error mapping
    auth/              sign-in, session, tenants, crypto, requireSession
    http/              errors and the error handler
    d1/                the client, the schema and withDocAccess   (M4)
  modules/
    projects/ billing/ directory/ tasks/ insight/ ledgers/ brand/
      routes.ts service.ts schema.ts AGENTS.md *.test.ts
```

Each module gets its own short `AGENTS.md`. It names what the module owns,
which ERPNext DocTypes it reads and writes, and its rules. These are the
reminders that arrive at the correct time, because an agent reads them when it
is already in the folder.

### Where each file goes

| Module | Routes | Libraries |
|---|---|---|
| `projects` | `projects`, `projectDetail`, `projectCrew`, `projectExpenses` | `projectFinance` |
| `billing` | `invoices`, `payments`, `payables` | `companyProfile`, `invoiceNumber`, `invoiceHtml`, `payQr`, `paymentRules`, `payablesAggregate` |
| `directory` | `clients`, `customers`, `vendors`, `equipment`, `inventory`, `lookups` | — |
| `tasks` | `tasks` | — |
| `insight` | `dashboard`, `insights` | `dashboardAggregate`, `smartAction` |
| `ledgers` | `studioRental`, `transactions`, `subscriptions` | `rentalBilling` |
| `brand` | `brand` | — |
| `kernel` | `auth` | `frappe`, `frappeError`, `errors`, `session`, `tenants`, `crypto`, `optionalFields`, `types`, both middleware |

`lib/backup.ts` is deleted at M2. Phase 6a removed the R2 bucket and the cron
that used it. The file has no caller.

### The rules for a module

1. A module imports `kernel/`. A module does not import a different module.
2. A module exports one Hono router and its types. Nothing else.
3. If two modules need the same code, that code moves into `kernel/`. Do not
   import across the boundary and do not copy the code.
4. A page that needs data from two modules gets it in `index.ts`, or the SPA
   makes two requests. Do not make a module that calls another module.
5. A module name is the same word in `app/src/features/` and in
   `worker/src/modules/`.

### The rules are checked by a machine

A reviewer forgets. A check does not. M3 adds these to continuous integration:

- A boundary check. A module that imports a different module fails the build.
- A `withDocAccess` check. A file in `modules/` that imports the D1 client and
  does not import `withDocAccess` fails the build.
- A migration check. Each `CREATE TABLE` has a `studio_id` column. Each index
  on `erp_name` starts with `studio_id`.

## Why

**The kernel is the answer to the boundary problem.** Option C gives a stronger
boundary and makes every change more expensive. Option B gives the same
boundary for the cost of one lint rule, because the rule that matters is
"a module does not import a module", and a tool checks that in one second.

**The module is the unit that an agent can hold.** A module is one folder with
its routes, its rules and its tests. An agent that reads that folder and its
`AGENTS.md` has enough context to be correct inside it, and cannot reach
outside it.

**The names follow Cloudflare.** Cloudflare deploys one Worker that serves
static assets and runs code. `worker/` and `app/` say that. `backend/` and
`frontend/` describe a two-server architecture that this application does not
have.

## What this costs

**M2 moves approximately 45 files and rewrites their imports.** The change adds
no feature. The test of success is narrow and it is the correct test: the same
165 tests pass, and the same routes answer.

**A module boundary is sometimes inconvenient.** A page that wants project data
and invoice data in one response must ask for it in `index.ts`, or the SPA must
make two requests. Accept this. It is the cost that buys the boundary.

## What does not change

- The five unmounted routes stay unmounted. `brand`, `projectExpenses`,
  `studioRental`, `subscriptions` and `transactions` read D1, and D1 returns at
  M4. Moving a file into a module is not the same as mounting it.
- `routes/auth.ts` is not rewritten. It is 334 lines of correct Frappe code and
  it moves into `kernel/auth/` without a change to its contents.
- The `exclude` list in `worker/tsconfig.json` was deleted at H2, when D1 was bound. Do not add one back.

## The order of the work

M1 must finish before M2 starts. M1 changes `wrangler.jsonc`, and M2 moves the
files that `wrangler.jsonc` points to. In the opposite order you debug both
changes at the same time.

| Milestone | What it does |
|---|---|
| M1 | One Worker and one origin. Static assets, `run_worker_first`, Wrangler 4. `wrangler.jsonc` moves to the repository root. **Changed by [ADR-0004](./0004-the-development-loop.md): it stays in `worker/`.** |
| M2 | This structure. No change to behaviour. |
| M3 | Continuous integration and the three checks above. |
| M4 | D1 and better-auth. `kernel/d1/` appears. The `exclude` list is deleted. |
| M5 | Project notes. One feature that proves the seam. |

## How we know if this was wrong

Write a new ADR if one of these happens.

- A module needs code from a different module, and moving that code into
  `kernel/` makes the kernel hold business rules. The modules are then drawn
  wrong.
- The kernel grows past approximately 1500 lines. It is then an application and
  not a kernel.
- A contributor cannot find the correct file within two minutes. The names are
  then wrong, and names are cheap to change.
