# StudioOS

The studio operations app: projects, clients, invoices and the money views,
built on top of a studio's own ERPNext.

It began as a rebuild of `Erpnext UI Application/CSDSxERPnext App` for one
studio, Cloud Shaped Dreams. It is now built as a **product for many studios** —
each one signs in with its own ERPNext, and StudioOS holds no copy of anyone's
data. That folder is untouched and remains the working system until StudioOS
reaches parity.

```
Browser ──► one Worker, one origin (Hono, Cloudflare Workers)
              ├──  static assets: the React SPA (app/dist)
              │    /api/* and /auth/* run the Worker first
              ├──► the signed-in studio's ERPNext REST API
              │      projects, clients, invoices, tasks, inventory …
              └──► Cloudflare KV   (the tenant registry, and nothing else)
```

**ERPNext is the only database.** StudioOS never talks to it directly, only over
its REST API, and every request runs on the signed-in user's own token.

## Auth

Each studio signs in with **its own ERPNext**, over OAuth2 / OIDC with PKCE.
No password ever reaches StudioOS. There is no admin key and no service
account: if ERPNext will not show a document to that user, StudioOS cannot
show it either, which is also why StudioOS contains no permission logic of its
own.

Sessions are a sealed, stateless cookie. The one piece of state kept outside
ERPNext is the **tenant registry** on Cloudflare KV — which studio's site, and
the client credentials StudioOS was registered with there — because it has to be
readable *before* we can talk to that site at all. Client secrets are encrypted
at the application level, not just at rest.

## Layout

| Path | What it is |
|---|---|
| `app/` | React 19 + Vite + TypeScript + Tailwind v4 SPA |
| `worker/` | Hono + TypeScript on Cloudflare Workers |
| `docs/` | `SEAM.md` (the constitution), `SPEC.md`, `PLAN-v2.md` (phases 6+), `archive/` |
| `AGENTS.md` | **Read this first.** The router: where things sit, which docs to trust, what not to do |

Each side has its own `package.json`, joined by a Bun workspace at the root.

## Stack

**Frontend** — React 19, Vite, TypeScript, Tailwind CSS v4, React Router,
TanStack Query, React Hook Form + Zod, react-chartjs-2, date-fns.

**Backend** — Hono, TypeScript, Cloudflare Workers, oauth4webapi, Zod.

> Drizzle and the D1 migrations are still in `worker/` but nothing is bound to
> them. They belong to six routes — brand, crew, expenses, studio rental,
> subscriptions, transactions — that are **not mounted**, pending the Phase 10f
> question of where that data lives in ERPNext. Dormant, not live.

## Why this exists

The previous app was ~90 standalone HTML files with a duplicated sidebar in each,
an Express bridge, and six flat JSON files acting as a database. It worked, but:

- the JSON ledgers could tear on a crashed write, and a deploy would overwrite them
- there was no auth of any kind
- a nav change meant editing 90 files

See `docs/SPEC.md` for the spec and `docs/PLAN-v2.md` for the phase plan.

## Contributing

Start with [`AGENTS.md`](./AGENTS.md), then [`docs/SEAM.md`](./docs/SEAM.md) —
or [`docs/seam-map.html`](./docs/seam-map.html) if you would rather see it than
read it. Between them they answer where a given piece of data belongs and why
this backend contains no permission code. Both humans and agents start there.

## Running it

One process, one origin, on port 8787:

```bash
bun install          # once, from the root
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

Sign-in, the Projects surface (list, detail, create, edit) and most of the
read-only parity work are done and verified against a live site. In progress:
**10f**, deciding where the six non-ERPNext datasets live. Not started:
onboarding a second studio (8), deployment (9), and the ledger pages (10g).

**Nothing is deployed yet.** `docs/DEPLOY.md` predates the OAuth work and still
describes the API-key setup that Phase 6c deleted; it is rewritten in Phase 9.

`docs/PLAN-v2.md` tracks exactly what has landed, with the verification records.
