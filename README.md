# StudioOS

The Cloud Shaped Dreams Studio operations app, rebuilt on a modern stack.

This is a **ground-up port** of `Erpnext UI Application/CSDSxERPnext App`. That
folder is untouched and remains the working system until StudioOS reaches parity.
ERPNext (Frappe Cloud) keeps exactly the role it had before: it is the system of
record. StudioOS never talks to its database directly, only to its REST API.

```
Browser ──► frontend (React SPA, Cloudflare Pages)
              │  fetch /api/*
              ▼
            backend (Hono, Cloudflare Workers)
              ├──► ERPNext REST API   (projects, invoices, customers, tasks …)
              └──► D1 (SQLite)        (the six local ledgers)
```

## Layout

| Path | What it is |
|---|---|
| `frontend/` | React 19 + Vite + TypeScript + Tailwind v4 SPA |
| `backend/` | Hono + TypeScript on Cloudflare Workers, Drizzle + D1 |

Each has its own `package.json` and is deployed independently.

## Stack

**Frontend** — React 19, Vite, TypeScript, Tailwind CSS v4, React Router,
TanStack Query, React Hook Form + Zod, react-chartjs-2, date-fns.

**Backend** — Hono, TypeScript, Cloudflare Workers, Drizzle ORM, D1, Zod.

**Auth** — Cloudflare Access at the edge. No login code in the app.

## Why this exists

The previous app was ~90 standalone HTML files with a duplicated sidebar in each,
an Express bridge, and six flat JSON files acting as a database. It worked, but:

- the JSON ledgers could tear on a crashed write, and a deploy would overwrite them
- there was no auth of any kind
- a nav change meant editing 90 files

See `docs/SPEC.md` and `docs/PLAN.md` for the migration spec and phase plan.

## Running it

Both sides, from two terminals:

```bash
cd backend && bun install && bun run dev
```

```bash
cd frontend && bun install && bun run dev
```

The frontend dev server proxies `/api/*` to the backend on `:8787`, so the
browser sees one origin exactly as it did before.

## Status

Phase 1 — foundation and the project→invoice tracer bullet. Not yet at parity
with the old app. `docs/PLAN.md` tracks what has landed.
