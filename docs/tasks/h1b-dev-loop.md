# H1b — a fast development loop, still on one origin

**State:** Open
**Owner:** Sandesh
**Size:** small. One day, and most of it is the decision, not the code.
**Comes before:** H3, the Figma work. Do it first or H3 is slow for weeks.

## Read these first

1. `AGENTS.md` — the router.
2. `docs/HANDOFF.md`, section H1 — the work that this continues.
3. `docs/SEAM.md`, section 8 — why one origin is a rule and not a preference.

## The goal

A change to a file in `app/src/` appears in the browser immediately. The browser
still sees one origin. `/api/*` and `/auth/*` still reach the Worker.

## Why this card exists

H1 was correct and it is merged. One origin is the rule, and `vite dev` on a
second port is a second origin, so the Vite development server was deleted.

That part of the decision was right. The result is that each change to the SPA
now needs `bun run build` and a restart of the Worker. There is no hot reload.

H3 is the Figma work. It is many small changes to the interface, one after the
other. A build for each change makes that work slow.

**The handoff did not tell you about the tool that solves this. That is a fault
in the handoff, not in your work.** This card corrects it.

## The tool

`@cloudflare/vite-plugin` runs your Worker inside the Vite development server,
in the `workerd` runtime. One process. One origin. Hot reload for the SPA.

Three facts that matter here:

- It reads the same `wrangler.jsonc`. You do not describe the Worker twice.
- It obeys `not_found_handling: "single-page-application"`, so routing in
  development is the same as routing in production. That is the property H1
  bought, and this tool keeps it.
- `vite build` then produces both halves, and Wrangler deploys the result.

## The decision inside this card

The plugin expects to find the Wrangler configuration beside the application it
serves. Today `wrangler.jsonc` is in `worker/` and the Vite application is in
`app/`.

You decided on 2026-09-30 that `wrangler.jsonc` stays in `worker/`, because a
move changes each script and each document and gives nothing in return. That
reasoning was correct with the information you had. **This tool is the something
that a move would give in return, so look at the decision again.**

Two ways are available. Both are acceptable.

- Move `wrangler.jsonc` to the repository root. `ADR-0002` expects it there.
  Then update each script and each document that names the path.
- Keep it in `worker/` and tell the plugin where it is.

Choose one, and write **ADR-0004** with the reason. Copy
`docs/adr/0000-template.md`. Write it in Simplified Technical English, as
`docs/adr/README.md` requires. Keep it short. A short ADR that exists is better
than a long one that does not.

## Do not break

Read this section twice. These are the rules, not the options.

- **One origin.** The browser must see one origin in development and in
  production. If a change needs a second port for the API, the change is wrong.
- **`run_worker_first` keeps its meaning.** `/api/*` and `/auth/*` reach the
  Worker. Each other path is a static file, or `index.html`.
- **`worker/src/routes/auth.ts` is not touched.** Not one line.
- **The redirects stay relative.** `/sign-in` and `/dashboard`, not an absolute
  address. You made them relative in H1 and that was correct.
- **`APP_UI_ORIGIN` does not return.** In any form, under any name.
- **`bun run start` continues to operate.** It is what production does, so it is
  how you test what production does.

## Verify

Do all four. Do not report that the agent passed its own test. Run them.

1. `bun run check` — the types and the 165 tests.
2. Start the new development server. Run
   `bun run worker/scripts/check-one-origin.ts http://localhost:<port>`.
   All five checks must pass.
3. `bun run start`, then the same script against `:8787`. All five must pass
   there too. The two servers must agree.
4. Change a colour or a word in a file in `app/src/`. The browser must show it
   with no build and no restart.

If check 2 and check 3 disagree, stop. A development server that routes
differently from production is worse than a slow one, because it hides the
fault until deployment.

## Ask first

- If the plugin needs you to change which paths reach the Worker. That is the
  rule from `docs/SEAM.md` section 8 and it is not yours to change alone.
- If you must add a second port for anything.
- Before you add a dependency that is not `@cloudflare/vite-plugin`.

## Done when

- All four verifications pass.
- `ADR-0004` exists, says where `wrangler.jsonc` lives, and says why.
- `AGENTS.md`, `README.md` and `scripts/README.md` describe how to start the
  application now. A command in a document that does not operate is a fault.
- `docs/HANDOFF.md` H1 records what changed, with the date.

## One note on how you did H1

`check-one-origin.ts` is the best thing in that branch. It tests
`run_worker_first` from both directions, and it found our own document wrong
about which direction fails. You recorded what you observed instead of matching
the prose.

Keep doing that. `docs/SEAM.md` section 8 is now corrected, and it cites your
script. When a document and a running machine disagree, the machine is right,
and the document is the thing to fix.
