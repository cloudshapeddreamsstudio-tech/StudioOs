# v1.0.2 — the design system: tokens and shared components

**State:** Open
**Owner:** Sandesh
**Release:** `v1.0.2`. Scope: `docs/releases/v1.0.2.md`. Read it first.
**Start from:** `release/v1.0.2`. Cut each `feat/` branch from `main`, and merge
it into `release/v1.0.2` when it passes.

---

## To the agent that reads this card

1. **A person sees no change on any screen.** That is the test of this whole
   release. If a screen looks different after your change, the change is wrong,
   or FRONTEND.md does not record a value. Stop and say which.
2. Do not move a feature screen onto the tokens. That is a later release.
3. **Ask before you add each dependency.** shadcn/ui adds some. List each one in
   the pull request, with what it does.
4. Do not change the scope. A new idea goes to `docs/RELEASE-2.md`.

---

## Read these first

1. `AGENTS.md`
2. `docs/releases/v1.0.2.md` — the scope
3. `docs/FRONTEND.md` — sections 1, 2, 3, 6 and 9
4. `docs/WORKFLOW.md` — the branches

---

## Part A — before the work

1. **Take the screenshots.** On demo, each page in the menu, plus one project
   page with each of its tabs. Light mode and dark mode. A computer width and a
   phone width. Keep them outside the repository. They are the "before".
2. **Remove the merged branches** on GitHub. Each of these is merged into
   `main`. Check each one with `git branch -r --merged origin/main` first:
   `docs/approve-v101-part-c`, `docs/erpnext-schema-policy`,
   `docs/frontend-constitution`, `fix/production-schema-skew`,
   `fix/v1.0.0-production-config`, and the six `fix/v101-*` branches.
   Keep `release/v1.0.0` and `release/v1.0.1`. A release branch is a record.

---

## Part B — the work

### B1. The tokens — `feat/design-tokens`

FRONTEND.md section 2. Write each token in `app/src/styles/index.css`, inside
`@theme`, with its light value and its dark value: the 11 colour roles of 2.1,
the type of 2.3, and the radius and shadow of 2.4.

**No component uses them yet.** So no screen changes. Sections 2.3 and 2.4 say
"To write": write them now, from the values that the screens use today, and
record them in FRONTEND.md in the same change.

### B2. The shared components — `feat/design-components`

FRONTEND.md section 3. Set up shadcn/ui (`components.json`). Add Button, Input,
Select, Card, Table and Badge with its CLI. Change the look of each one to the
current design, with the tokens. Then point the current shared components at
them: `btn`, `form-input`, `form-select`, `Card`, `TableShell`, `StatusBadge`.

`PageHeader` and `QueryState` stay StudioOS components.

Compare the screenshots after B2. Each page must look the same.

### B3. The lint, as a warning — `feat/design-lint`

FRONTEND.md section 8. Install `@shadcn/lint`, with the linter that runs with
Bun on Windows and in CI. Record the choice in FRONTEND.md. Add it to
`bun run check` as a **warning**, not an error. Write the count of breaks in
`docs/releases/v1.0.2.md`. That number goes down in each later release.

If `@shadcn/lint` does not install or does not run, stop and tell Malhar. It is
version 0.2.0. The rules of section 6 stay. The tool can change.

---

## Part C — the demo test

`docs/releases/v1.0.2.md`, "The demo test". Deploy `release/v1.0.2` to demo.
Take the "after" screenshots. Compare each pair. Write the result in the
release file. Then tell Malhar.

---

## Done when

- `bun run check` passes, with the lint as a warning, and its count recorded.
- Each page on demo looks the same as before, in light and dark, on a computer
  and on a phone.
- Each new dependency is listed and accepted.
- The merged branches are removed.
- `docs/releases/v1.0.2.md` has the record filled up to "Demo deployed and
  tested".
