# StudioOS

The studio operations app: projects, clients, invoices and the money views,
built on top of a studio's own ERPNext.

It is built for one studio first, Cloud Shaped Dreams, and designed so that
other studios can connect later. Each studio signs in with its own ERPNext, and
StudioOS holds no copy of anyone's books.

**The release target:** Shubham uses StudioOS each day for real project work.

```
Browser ──► one Worker, one origin (Hono, Cloudflare Workers)
              ├──  static assets: the React SPA (app/dist)
              │    /api/* and /auth/* run the Worker first
              ├──► the signed-in studio's ERPNext REST API
              │      projects, clients, invoices, tasks, inventory …
              ├──► Cloudflare KV   (the tenant registry)
              └──► Cloudflare D1   (StudioOS's own data: today, sessions)
```

**ERPNext is the only database.** StudioOS never talks to it directly, only over
its REST API, and every request runs on the signed-in user's own token.

## Auth

Each studio signs in with **its own ERPNext**, over OAuth2 / OIDC with PKCE.
No password ever reaches StudioOS. There is no admin key and no service
account: if ERPNext will not show a document to that user, StudioOS cannot
show it either, which is also why StudioOS contains no permission logic of its
own.

A session is a row in **D1**, and the cookie holds only a random identifier.
To delete the row signs that browser out on its next request. D1 stores the
identifier's hash, never the identifier, and the ERPNext tokens encrypted. See
[ADR-0003](./docs/adr/0003-how-sessions-are-stored.md).

The **tenant registry** is on Cloudflare KV — which studio's site, and the
client credentials StudioOS was registered with there — because it has to be
readable *before* we can talk to that site at all. Client secrets are encrypted
at the application level, not just at rest.

## Layout

| Path | What it is |
|---|---|
| `app/` | React 19 + Vite + TypeScript + Tailwind v4 SPA |
| `worker/` | Hono + TypeScript on Cloudflare Workers |
| `docs/` | `RELEASE-1.md` (the current scope), `SEAM.md` (the constitution), `DEPLOY.md`, `FINDINGS.md`, `PLAN-v2.md` (history of phases 6 to 10), `adr/`, `tasks/`, `archive/` |
| `AGENTS.md` | **Read this first.** The router: where things sit, which docs to trust, what not to do |

Each side has its own `package.json`, joined by a Bun workspace at the root.

## Stack

**Frontend** — React 19, Vite, TypeScript, Tailwind CSS v4, React Router,
TanStack Query, React Hook Form + Zod, react-chartjs-2, date-fns.

**Backend** — Hono, TypeScript, Cloudflare Workers, oauth4webapi, Zod.

> D1 holds the session tables in `worker/migrations/`. The old ledger tables,
> and the Drizzle schema for them, are parked in `worker/migrations-parked/` and
> are not applied. Their five routes are **not mounted**: `docs/SEAM.md`
> section 1 decides where each data set lives first.

## Why this exists

The previous app was ~90 standalone HTML files with a duplicated sidebar in each,
an Express bridge, and six flat JSON files acting as a database. It worked, but:

- the JSON ledgers could tear on a crashed write, and a deploy would overwrite them
- there was no auth of any kind
- a nav change meant editing 90 files

See `docs/RELEASE-1.md` for what ships now, and `docs/SEAM.md` for the rules.

## Contributing

Start with [`AGENTS.md`](./AGENTS.md), then [`docs/SEAM.md`](./docs/SEAM.md) —
or [`docs/seam-map.html`](./docs/seam-map.html) if you would rather see it than
read it. Between them they answer where a given piece of data belongs and why
this backend contains no permission code. Both humans and agents start there.

## Running it

One process, one origin, on port 8787:

```bash
bun install          # once, from the root
bun run db:migrate   # once, and after each new migration: local D1 tables
bun run dev          # daily work: hot reload, the Worker runs inside Vite
bun run start        # what production does: vite build, then vite preview
```

Both serve the SPA and run `/api/*` and `/auth/*` on the same port. Run one at
a time. See [ADR-0004](./docs/adr/0004-the-development-loop.md). Sign-in needs
a tenant registered against a local bench — see `docs/PLAN-v2.md` phase 6b,
including the Frappe-specific traps worth reading before debugging one.

`bun run check` from the root typechecks both sides and runs the suite. All
tests must pass.

## Status

**Release 1 is built and is not yet deployed.** It is on the `release-1`
branch. The next step is to deploy staging at `demoos.cloudshapeddreamsstudio.com`
and test each feature by hand: `docs/tasks/r1-staging.md`. Then production at
`studioos.cloudshapeddreamsstudio.com`.

`docs/RELEASE-1.md` lists what is in release 1, and what waits for release 2.

`docs/PLAN-v2.md` tracks exactly what has landed, with the verification records.
