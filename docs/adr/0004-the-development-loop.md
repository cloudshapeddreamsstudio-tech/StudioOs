# 0004. The development loop, and where wrangler.jsonc lives

- **Status:** Accepted
- **Date:** 2026-10-01
- **Owner:** Sandesh
- **Changes:** `ADR-0002`, the M1 row of its milestone table. `wrangler.jsonc`
  stays in `worker/`. It does not move to the repository root.

## The question

How does a change to the SPA appear in the browser without a build, while the
browser still sees one origin? And does `wrangler.jsonc` move to the
repository root for that?

## Why the question is open

H1 deleted the Vite development server, because it was a second origin. After
H1, each change to the SPA needed a build and a restart. H3 is many small
changes to the interface, so that loop is too slow.

`@cloudflare/vite-plugin` runs the Worker inside the Vite development server, in
`workerd`. One process, one origin, and hot reload for the SPA.

The task card `docs/tasks/h1b-dev-loop.md` asked one question again: does
`wrangler.jsonc` move to the repository root, as the M1 row of ADR-0002 says?

These are the facts that we tested on 2026-10-01, with plugin 1.62.3,
Wrangler 4.145.0 and Vite 6.4.3:

1. The plugin finds the Wrangler configuration by itself only in the Vite
   project folder. That folder is `app/`, because `app/vite.config.ts` is there.
   It is not the repository root.
2. The plugin keeps its local KV and D1 state in `.wrangler/state` inside the
   Vite folder, by default. `bun run dev:api` keeps it in `worker/.wrangler`.
   Two folders mean two registries. In the second one, no studio is registered,
   and sign-in fails.
3. The plugin reads `worker/.dev.vars` when `configPath` names
   `worker/wrangler.jsonc`.
4. The plugin obeys `run_worker_first`. Without it, the deep link `/projects`
   gets the Worker's 404 in the development server, the same failure that H1
   found in `wrangler dev`.
5. `vite build` now writes the SPA to `app/dist/client` and the Worker to
   `app/dist/studioos_worker`, with a generated `wrangler.json`. This is what
   production deploys after this change.
6. The plugin bundles the Worker with Vite, not with esbuild. Under Vite, the
   `qrcode` entry point loads `pngjs`, and `pngjs` stopped the Worker at start.
   `lib/payQr.ts` now calls the SVG renderer of `qrcode` directly. A test
   compares the bytes with the old output.

## The options

**A. Move `wrangler.jsonc` to the repository root.** The plugin still does not
find it by itself, because of fact 1. So `vite.config.ts` still names the path.
To remove that line, `vite.config.ts` also moves to the root, and `app/` and
`worker/` become one Vite project. That is a larger change to ADR-0002.

**B. Keep `wrangler.jsonc` in `worker/`.** `app/vite.config.ts` names the path
with `configPath`, and names the state folder with `persistState`. No file
moves. No script or document changes its path.

## The decision

Use option B. `wrangler.jsonc` stays in `worker/`.

The conditions:

1. `app/vite.config.ts` sets `configPath` to `../worker/wrangler.jsonc`.
2. `app/vite.config.ts` sets `persistState` to `../worker/.wrangler/state`.
   Each way to start StudioOS uses this one state folder.
3. The development server and the preview server use port 8787, with
   `strictPort`. That is the port of `APP_ORIGIN` and of the OAuth redirect
   URI on the studio's ERPNext. Only one of them runs at a time.
4. `bun run dev` is the daily loop: hot reload, Worker inside.
   `bun run start` is `vite build`, then `vite preview`: it runs the build that
   production deploys.
5. `check-one-origin.ts` passes against `bun run dev` and against
   `bun run start`. If the two disagree, the development server is wrong.

## Why

**The strongest reason: a move to the root does not remove the path from the
Vite configuration.** Fact 1 is the reason. Option A pays for each changed
script and document, and gets back nothing that option B does not have.

**`persistState` is necessary in both options.** It is the setting that a
reader can miss, and its failure looks like a broken sign-in. Option B puts it
beside `configPath`, where a reader sees both together.

**`bun run start` now runs the production build.** Before this change, it ran
the esbuild bundle of `wrangler dev`. Production will deploy the Vite bundle.
Fact 6 shows that the two bundles are not the same. So the test of "what
production does" must use the Vite bundle.

## What this costs

The development server and the preview server cannot run at the same time.
Both use port 8787. A second port is a second origin, and sign-in does not
return to a second origin.

`bun run dev:api` still runs the Worker with `wrangler dev` and esbuild. It is
not the production bundle. Use it for Worker work without the SPA. Do not use it
as the test of what production does.

`vite build` copies `worker/.dev.vars` into `app/dist/studioos_worker/`. The
`dist/` folder is ignored by git. Do not commit or share that folder.

`docs/DEPLOY.md` uses the output of `vite build`: `bun run deploy:ENV`.

## What does not change

- One origin, in development and in production. No second port.
- `run_worker_first` sends `/api/*` and `/auth/*` to the Worker. Each other path
  is a static file or `index.html`.
- `worker/src/routes/auth.ts`. The redirects stay relative.
- `APP_UI_ORIGIN` does not return, under any name.

## How we know if this was wrong

Write a new ADR when one of these occurs:

- `check-one-origin.ts` passes against one server and fails against the other.
- The plugin finds the Wrangler configuration in a parent folder by itself.
  Then option A can remove a line, and the costs change.
- M2 divides the Worker into modules, and a single Vite project at the root
  makes that work smaller.
