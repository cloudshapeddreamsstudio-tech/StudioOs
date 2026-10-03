# FRONTEND — the design system of StudioOS

> **State: OUTLINE, not accepted.** This file gives the sections, the rules
> that are proposed, and the decisions that are still open. Nothing here is a
> rule until Sandesh and Malhar accept it. Open decisions are marked **DECIDE**.

This document is the constitution of `app/`. `docs/SEAM.md` says where data
lives. This document says how StudioOS looks, and where each design decision
lives in the code.

Written in ASD-STE100 Simplified Technical English. See `docs/adr/README.md`.

---

## 0. Why this document exists

The design is final. Shubham confirmed it on 2026-10-03. Small changes can come
later, from Shubham only.

Today the design is not written down. It is in 755 raw colour classes, in 28
of the 48 files in `app/src/` (counted on 2026-10-03). A component writes
`text-gray-400`, not "muted text". So:

- A new screen copies class names from an old screen, and copies can drift.
- A change to one colour is a change in many files.
- An agent cannot know which value is the design and which is an accident.

**The rule of this document, in one sentence:** each design value has a name,
it is written in one place, and the code uses the name, not the value.

---

## 1. The stack

What `app/` uses. Change one of these only with an ADR.

| Need | Choice |
|---|---|
| Framework | React 19, TypeScript |
| Build and development | Vite, `@cloudflare/vite-plugin` (ADR-0004) |
| Styling | Tailwind CSS v4. The theme is CSS, in one file. No `tailwind.config.js` |
| Components | **shadcn/ui** (D1, decided 2026-10-03). The source is copied into `components/ui/` and StudioOS owns it |
| Design lint | **`@shadcn/lint`** (D2, decided 2026-10-03). It runs on ESLint 9.30+ or Oxlint 1.80+. Section 8 |
| Routing | React Router 7 |
| Server data | TanStack Query 5 |
| Forms | React Hook Form 7 and Zod |
| Charts | Chart.js 4 and react-chartjs-2 |
| Dates | date-fns 4 |
| Icons | **Lucide** (`lucide-react`; D3 and D3a, decided 2026-10-03). The default set of shadcn/ui. No SVG written by hand |
| Font | Inter, 400 to 700, loaded from **Google Fonts** (D4, decided 2026-10-03). Section 2.3 |

---

## 2. The tokens: the names of the design

The tokens are the design. Each one has a name and one value, in
`app/src/styles/index.css`, inside `@theme`. A component names the token.

### 2.1 Colour

Each colour has a role. The role is the name, not the hue.

Each row is a role, its use, and the value that the screens use today. The
role names are the shadcn/ui names (D6). A name marked *StudioOS* is an
addition, because shadcn/ui has no role for it.

| Role | Use | Today, in the code |
|---|---|---|
| `background` | the page | `bg-gray-100`, dark `bg-gray-900` |
| `card` | a card, a table, the header | `bg-white`, dark `bg-gray-800` |
| `foreground` | normal text | `text-gray-800`, dark `text-gray-100` |
| `muted-foreground` | secondary text that a person reads: a label, a table header, a description, an inactive tab | `text-gray-500`, dark `text-gray-400` |
| `subtle-foreground` *StudioOS* | the quietest text: a caption, a count, a hint, an empty list | `text-gray-400`, dark `text-gray-500` |
| `border` | a card edge, a table line, an input | `border-gray-200`, dark `border-gray-700/60` |
| `primary` | the brand, the main button, a link | `violet-500`, hover `violet-600` |
| `destructive` | an error, a delete action | `red-500` and `red-600` |
| `warning` *StudioOS* | a warning, an unpaid amount | `amber-500` to `amber-700` |
| `success` *StudioOS* | paid, completed | `green-500` to `green-700` |
| `info` *StudioOS* | open, draft | `sky-400` to `sky-700` |

**Decided (D5, 2026-10-03): two roles.** `text-gray-500` (50 uses) and
`text-gray-400` (110 uses) are two roles, not one colour that drifted:

- `gray-500` is on labels, table cells and headers, and inactive tabs: text
  that a person reads.
- `gray-400` is mostly `text-xs`, on captions, counts, hints and empty lists:
  text that a person can skip.
- In dark mode the two change places: `gray-500` becomes `gray-400`, and
  `gray-400` becomes `gray-500`. So each role has its own light value and its
  own dark value. Only a role name can hold that.

`muted-foreground` is the shadcn name. `subtle-foreground` is a StudioOS name,
because shadcn/ui has one muted role only. Shubham confirmed the two
descriptions above on 2026-10-03.

**Decided (D6, 2026-10-03): the shadcn/ui names.** The shadcn components and
`@shadcn/lint` read these names with no translation. A component writes
`text-muted-foreground`, not `text-gray-500`. Each name has one light value
and one dark value, in `styles/index.css`.

Do not add a role name without a reason in the pull request. A new hue for one
screen is not a reason.

### 2.2 The status colours

One table: each ERPNext status and its role. Today it is in
`components/ui/StatusBadge.tsx`. Rule: a status colour is defined only there,
and only with the roles of 2.1.

### 2.3 Typography

**Decided (D4, 2026-10-03): Inter, from Google Fonts.** The `@import` stays at
the top of `styles/index.css`, with weights 400, 500, 600 and 700, and
`display=fallback`. The font token is `--font-inter`.

What this costs, stated so that a reader can disagree:

- Each first page load sends a request to Google. Google sees the visit.
- If Google Fonts is slow or blocked, the text shows in the fallback font
  (`ui-sans-serif`, `system-ui`). The app still operates.

Rule: no second font, and no font from a different source. A new weight is a
change to the one `@import`.

To write: the sizes that are permitted (for example `text-xs`, `text-sm`,
`text-2xl`), the weights, and the use of each.

### 2.4 Space, shape and depth

To write: the corner radius of each kind of element (today `rounded-lg`,
`rounded-xl`, `rounded-full`), the two shadows in `@theme`, and the spacing
steps that are permitted.

### 2.5 Charts

Chart.js does not read Tailwind classes. To write: one module that gives the
chart colours from the same tokens, so a chart and a card agree.

### 2.6 Dark mode

Each token has a dark value. Dark mode is the class `.dark` on `<html>`, set
before the first paint. The `localStorage` key `dark-mode` does not change.

---

## 3. The components

**Decided (D1, 2026-10-03): StudioOS uses shadcn/ui.**

shadcn/ui is not a package that StudioOS imports. Its CLI copies the source of
each component into `app/src/components/ui/`. After the copy, StudioOS owns
that code: it can read it, change it, and keep it. `components.json` records
the configuration of the CLI.

What this means:

- **The look of a shadcn component is changed to match the StudioOS design.**
  The design is final. shadcn/ui gives the structure and the behaviour (focus,
  keyboard, accessibility). It does not give the look. A shadcn default that is
  different from the design is changed in the component, one time.
- **A component is added with the shadcn CLI**, not written from nothing and not
  copied from a website. Then its look is changed to the design.
- **shadcn/ui adds dependencies.** The CLI installs what each component needs.
  To write here: the list, after the first install. Each one is accepted in
  that pull request (AGENTS.md: ask before you add a dependency).

To write: the list of components, what each one is for, and its variants. Each
current component maps to a shadcn component, or stays as a StudioOS component:

| Today | With shadcn/ui |
|---|---|
| `btn`, `btn-primary`, `btn-secondary` | `Button`, with variants |
| `form-input`, `form-select` | `Input`, `Select` |
| `Card` | `Card` |
| `TableShell` | `Table` |
| `StatusBadge` | `Badge`, with one variant for each status role |
| `PageHeader`, `QueryState` | stay StudioOS components, built from shadcn parts |

Rules, proposed:

1. A screen uses a shared component when one exists. It does not build a copy.
2. A component changes its look through a variant, not through extra classes
   from the caller. A new look is a new variant, added in the component.
3. A shared component lives in `components/ui/`. A component that only one
   feature uses lives in that feature folder.
4. A component does not fetch data. A feature passes the data in.
5. The state of each list and each page has a fixed look: loading, empty, error.
   `QueryState` is the one place for it.
6. Each icon comes from Lucide (`lucide-react`). Do not write an SVG icon by
   hand. Do not add a second icon set. An icon that Lucide does not have is a
   question for Shubham, not an SVG in a feature folder.

---

## 4. The layout

To write: the app shell (`AppLayout`, `Sidebar`, `Header`), the page header,
the width of the content, and the grid.

Rule: each page inside the app uses the shell. Only the public home page and the
sign-in page are outside it.

Rule: each page operates on a phone. Test B29 is the minimum.

---

## 5. The folders

```
app/src/
  styles/index.css     the tokens. The only place a design value is written
  components/ui/       shared components
  components/layout/   the app shell
  features/<name>/     one folder for each area. Its pages, api.ts, types
  lib/                 code that is not a component
```

Rules, proposed:

1. A feature folder does not import a different feature folder.

   **One break of this rule exists today (found 2026-10-03).**
   `features/marketing/HomePage.tsx` imports `useSession` from
   `features/auth/api.ts`. `useSession` is needed by more than one place:
   `components/layout/Header.tsx` uses it too. So it moves out of a feature,
   for example to `lib/session.ts`, in the migration. No other feature imports
   a different feature.
2. A feature has the same name in `app/src/features/` and in
   `worker/src/modules/`. **Decided (D7, 2026-10-03): the names of the app
   win.** They are the names that a person sees in the menu, and the app does
   not change. The Worker modules take them when ADR-0002 (M2) is done:

   | Feature, and its module | ADR-0002 named the module |
   |---|---|
   | `dashboard` | `insight` |
   | `invoices` | `billing` (with `payables`) |
   | `payables` | `billing` (with `invoices`) |
   | `projects`, `tasks`, `directory`, `ledgers` | the same |

   Two features have no module, and that is correct. `auth` uses
   `kernel/auth` in the Worker, which is not a module. `marketing` is the
   public home page. It reads only who is signed in, from `/auth/me`.

   ADR-0002 is Malhar's. This changes its module table, so the change goes in
   the ADR that amends ADR-0002 before M2 starts. Where `brand` goes is open
   in that ADR.
3. Each request to the Worker goes through `lib/api.ts`.

---

## 6. What a screen must not contain

`@shadcn/lint` checks each item (D2). The rule is
given.

| Do not write | Write | Rule |
|---|---|---|
| a palette colour, such as `text-gray-400` | the role, such as `text-muted-foreground` | `no-raw-colors` |
| a one-time value, such as `p-[13px]` | a step from section 2 | `no-arbitrary-values` |
| `className` that changes a shared component | a variant of that component | `no-restyle` |
| `style={{ … }}` | a class or a variant | `no-inline-styles` |
| a class name that Tailwind does not know | a correct class | `no-unknown-classes` |
| a class string made at run time | a static string, or a variant map | `require-static-classes` |

---

## 7. How the design changes

The design is final. A change is small and comes from Shubham.

1. A change to a value is a change to one token, in `styles/index.css`.
2. A change to a component is a change in `components/ui/`, with a new or
   changed variant.
3. A new token or a new variant needs a reason in the pull request.
4. A screen does not change the design by itself. If a screen needs a look that
   does not exist, stop and ask.

---

## 8. How this is enforced

| Check | Where |
|---|---|
| Types | `bun run check` |
| The design rules in section 6 | `@shadcn/lint`, in `bun run check` and in CI |
| Feature folders do not import each other | the boundary check of ADR-0002, extended to `app/` |
| Each page on a phone | test B29, by a person |

**Decided (D2, 2026-10-03): StudioOS adopts `@shadcn/lint`.**

- It reads the design system from `components.json`, because D1 is shadcn/ui.
  So the tokens of section 2 and the variants of section 3 are what it checks.
- It needs a linter underneath: ESLint 9.30+ or Oxlint 1.80+. `app/` has
  neither today. The choice of one is made at the install, by a test: the
  linter must run with Bun on Windows and in CI. Record the choice here.
- An error explains the break and names the token or the variant to use. That
  is the reason for this tool: an agent can correct its own change.
- The lint is part of `bun run check`. A commit that breaks it does not pass.

---

## 9. The migration

The current screens break most rules in section 6. The rules come first, then
the screens move, then the lint is switched on. In this sequence:

1. Accept this document. Close each **DECIDE**.
2. Write the tokens in `styles/index.css`. The screens do not change.
3. Move the shared components onto the tokens.
4. Move each feature, one feature for each commit. The screen looks the same
   before and after. That is the test of each commit.
5. Switch the lint on, as an error, when no screen breaks it. Until then it
   runs as a warning, so the count of breaks goes down with each commit and is
   visible.

**DECIDE (D8):** the place of this work in the sequence. It changes each screen
in `app/`. Release 1 is frozen on `release-1`. If Malhar asks for the missing
release-1 controls (invoices, tasks, docs), build them after step 3, so that
they are built on the tokens once and not built two times.

---

## The open decisions

| # | Decision | Owner |
|---|---|---|
| ~~D1~~ | ~~shadcn/ui, or the hand-made components~~ **Decided 2026-10-03: shadcn/ui.** Section 3 | Sandesh |
| ~~D2~~ | ~~`@shadcn/lint`~~ **Decided 2026-10-03: adopt it.** Section 8 | Sandesh |
| ~~D3~~ | ~~An icon set, or SVG by hand~~ **Decided 2026-10-03: an icon set.** | Sandesh |
| ~~D3a~~ | ~~Which icon set~~ **Decided 2026-10-03: Lucide.** | Sandesh |
| ~~D4~~ | ~~Inter from Google Fonts, or from our own files~~ **Decided 2026-10-03: Google Fonts.** Section 2.3 | Sandesh |
| ~~D5~~ | ~~One muted text colour or two~~ **Decided 2026-10-03: two.** Section 2.1 | Sandesh. Confirmed by Shubham 2026-10-03 |
| ~~D6~~ | ~~The token names~~ **Decided 2026-10-03: the shadcn/ui names.** Section 2.1 | Sandesh |
| ~~D7~~ | ~~The feature names~~ **Decided 2026-10-03: the names of the app.** Section 5 | Sandesh |
| D8 | When the migration runs, compared to release 1 | Malhar |
