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
| Components | **DECIDE (D1).** shadcn/ui, proposed by Malhar, or the current hand-made set |
| Design lint | **DECIDE (D2).** `@shadcn/lint`, proposed by Malhar |
| Routing | React Router 7 |
| Server data | TanStack Query 5 |
| Forms | React Hook Form 7 and Zod |
| Charts | Chart.js 4 and react-chartjs-2 |
| Dates | date-fns 4 |
| Icons | **DECIDE (D3).** Today: SVG written by hand, approximately 20 |
| Font | Inter, 400 to 700. **DECIDE (D4)** where it is loaded from |

---

## 2. The tokens: the names of the design

The tokens are the design. Each one has a name and one value, in
`app/src/styles/index.css`, inside `@theme`. A component names the token.

### 2.1 Colour

Each colour has a role. The role is the name, not the hue.

To write: one table. Each row is a role, its light value, its dark value, and
where it is used. Proposed roles, from what the screens use today:

| Role | Use | Today, in the code |
|---|---|---|
| `background` | the page | `bg-gray-100`, dark `bg-gray-900` |
| `surface` | a card, a table, the header | `bg-white`, dark `bg-gray-800` |
| `foreground` | normal text | `text-gray-800`, dark `text-gray-100` |
| `muted` | secondary text, a label | `text-gray-500` and `text-gray-400` |
| `border` | a card edge, a table line, an input | `border-gray-200`, dark `border-gray-700/60` |
| `primary` | the brand, the main button, a link | `violet-500`, hover `violet-600` |
| `danger` | an error, a delete action | `red-500` and `red-600` |
| `warning` | a warning, an unpaid amount | `amber-500` to `amber-700` |
| `success` | paid, completed | `green-500` to `green-700` |
| `info` | open, draft | `sky-400` to `sky-700` |

**DECIDE (D5):** `text-gray-500` and `text-gray-400` are both used for muted
text, 50 and 110 times. Is that one role or two?

**DECIDE (D6):** the role names. If D1 is shadcn, use the shadcn names
(`primary`, `muted-foreground`, `destructive` and the others), so that its
components and its lint read them without a translation.

### 2.2 The status colours

One table: each ERPNext status and its role. Today it is in
`components/ui/StatusBadge.tsx`. Rule: a status colour is defined only there,
and only with the roles of 2.1.

### 2.3 Typography

To write: the font, the sizes that are permitted (for example `text-xs`,
`text-sm`, `text-2xl`), the weights, and the use of each.

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

To write: the list of shared components, what each one is for, and its
variants. Today: `Card`, `TableShell`, `PageHeader`, `QueryState`,
`StatusBadge`, `btn-primary`, `btn-secondary`, `form-input`, `form-select`.

Rules, proposed:

1. A screen uses a shared component when one exists. It does not build a copy.
2. A component changes its look through a variant, not through extra classes
   from the caller. A new look is a new variant, added in the component.
3. A shared component lives in `components/ui/`. A component that only one
   feature uses lives in that feature folder.
4. A component does not fetch data. A feature passes the data in.
5. The state of each list and each page has a fixed look: loading, empty, error.
   `QueryState` is the one place for it.

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
2. A feature has the same name in `app/src/features/` and in
   `worker/src/modules/`. **DECIDE (D7):** which names. See the open question
   about the module names.
3. Each request to the Worker goes through `lib/api.ts`.

---

## 6. What a screen must not contain

Each item is checked by a machine if D2 is accepted. The `@shadcn/lint` rule is
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
| The design rules in section 6 | `@shadcn/lint`, in `bun run check` and in CI, if D2 is accepted |
| Feature folders do not import each other | the boundary check of ADR-0002, extended to `app/` |
| Each page on a phone | test B29, by a person |

---

## 9. The migration

The current screens break most rules in section 6. The rules come first, then
the screens move, then the lint is switched on. In this sequence:

1. Accept this document. Close each **DECIDE**.
2. Write the tokens in `styles/index.css`. The screens do not change.
3. Move the shared components onto the tokens.
4. Move each feature, one feature for each commit. The screen looks the same
   before and after. That is the test of each commit.
5. Switch the lint on, as an error, when no screen breaks it.

**DECIDE (D8):** the place of this work in the sequence. It changes each screen
in `app/`. Release 1 is frozen on `release-1`. If Malhar asks for the missing
release-1 controls (invoices, tasks, docs), build them after step 3, so that
they are built on the tokens once and not built two times.

---

## The open decisions

| # | Decision | Owner |
|---|---|---|
| D1 | shadcn/ui, or the hand-made components | Malhar and Sandesh |
| D2 | `@shadcn/lint`. It needs ESLint 9.30+ or Oxlint 1.80+, which `app/` does not have | Malhar and Sandesh |
| D3 | An icon set, for example Lucide, or SVG by hand | Sandesh |
| D4 | Inter from Google Fonts, or from our own files | Sandesh |
| D5 | One muted text colour or two | Shubham |
| D6 | The token names | Sandesh, after D1 |
| D7 | The feature names, the same as the Worker modules | Sandesh |
| D8 | When the migration runs, compared to release 1 | Malhar |
