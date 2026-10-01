# Handoff — the work ahead

This document is for Sandesh. It gives the next pieces of work, the order to do
them in, and the decisions inside each one that are yours to make.

`AGENTS.md` tells you how to work in this repository. This document tells you
what to build next and why that order is correct. When the two disagree,
`AGENTS.md` is correct, because it changes less often.

Written in ASD-STE100 Simplified Technical English, as all documents here are.
See `docs/adr/README.md`.

---

> **2026-10-02.** H1, H1b, H2 and H2b are done. The current work is release 1:
> read `docs/RELEASE-1.md` and `docs/tasks/r1-staging.md`. H3 and the list
> "After these" start after release 1.

## How to read this

Each piece of work has four parts.

- **The goal.** One sentence. You know when it is done.
- **Why it is here.** The reason this comes before or after something else.
- **What you decide.** The choices that belong to you, not to the agent.
- **Stop and ask.** The points where you must not decide alone.

Work through them in order. Do not start one before the previous one is
finished. The order is not a preference. Each item removes a problem that would
make the next item more difficult.

---

## H1 — One Worker and one origin

> **Done 2026-10-01.** One Worker serves `app/dist` and runs the API.
> `APP_UI_ORIGIN` is deleted. `worker/scripts/check-one-origin.ts` tests the
> routing from both directions and is the thing to run before you trust it.
>
> **H1b — done 2026-10-01.** `bun run dev` runs the Worker inside the Vite
> development server with `@cloudflare/vite-plugin`: hot reload, one origin,
> port 8787. `bun run start` is now `vite build` then `vite preview`, the
> bundle that production deploys. `wrangler.jsonc` stays in `worker/`. See
> [ADR-0004](./adr/0004-the-development-loop.md).


**The goal.** One Cloudflare Worker serves the SPA files and also runs the API.
`APP_UI_ORIGIN` no longer exists, because it is the same as `APP_ORIGIN`.

**Why it is here.** Today the SPA and the API are two deployments on two
origins. A browser treats two origins as two different websites. A cookie that
one origin sets does not go to the other one without extra rules, and those
rules fail in production and do not fail in development.

H2 adds a session cookie. If you do H2 first, you debug the cookie and the
origins at the same time, and you cannot tell which one is wrong. Do H1 first
and H2 becomes uninteresting, which is what you want from authentication work.

**The work.**

1. Change Wrangler from version 3 to version 4. Version 4.20 or higher is
   necessary for step 2.
2. Add a static assets block to `worker/wrangler.jsonc`. Add
   `run_worker_first` with the list `["/api/*", "/auth/*"]`.
3. Set `APP_ORIGIN` to the address the Worker answers on.
4. Delete `APP_UI_ORIGIN` and the code in `routes/auth.ts` that chooses between
   the two.

```jsonc
"assets": {
  "directory": "../app/dist",
  "not_found_handling": "single-page-application",
  "binding": "ASSETS",
  "run_worker_first": ["/api/*", "/auth/*"]
}
```

**Why `run_worker_first` is necessary.** Without that line, Cloudflare uses the
`Sec-Fetch-Mode` header to decide what to do. The OAuth callback is a browser
navigation, not an XHR request. Cloudflare then sends `index.html`, and the
callback never arrives at the Worker. Sign-in then fails with no error in the
Worker log, because the Worker never ran.

**What you decide.** Where `wrangler.jsonc` lives after this change.
**Decided 2026-09-30: it stays in `worker/`.** ADR-0002 shows it there, and
`../app/dist` resolves from there. A move to the root changes each script and
each document that names the path, and gives nothing in return. An earlier
version of this paragraph said the root. That was a fault in this document.

**Decided 2026-09-30: there is no Vite development server.** It is a second
origin. The SPA is rebuilt with `bun run start` after each change.

**Stop and ask.** Nothing here needs a decision from Malhar. It is reversible
and nothing is deployed yet.

**Done when.** `bun run build` then `bunx wrangler dev` serves the SPA and
answers `/api/health` from one port. Sign-in still works.

---

## H2 — Sessions that can be cancelled

> **Done 2026-10-01, reviewed and merged.** A session is a row in D1 behind
> `kernel/auth`. The cookie holds a random identifier. D1 holds its SHA-256 and
> the ERPNext tokens, encrypted. To delete the row cancels the session.
> [ADR-0003](./adr/0003-how-sessions-are-stored.md) records the decision.
> `docs/SEAM.md` Amendment 4 records what changed about what an attacker gets,
> because the tokens are now at rest.
>
> Tested on a local Worker only. Real D1 is tested at deployment.
>
> **H2b — done 2026-10-01.** `POST /auth/logout-all` ends every session of the
> signed-in person on that studio, in each browser, and revokes each of their
> ERPNext tokens. Proved with two browsers:
> `worker/scripts/check-sign-out-everywhere.ts`. The operator function
> `endAllSessionsOf(env, host, erpUser)` is in `kernel/auth`, tested, and has
> **no route**: Phase 6d decides who may call it. Revocation at ERPNext now gives
> up after 5 seconds, on both sign-out paths, so a site that hangs cannot hang a
> sign-out.


**The goal.** A session is a row in D1, not a sealed cookie. The ERPNext tokens
move out of the cookie into a table. Sign-in behaves exactly as it does today.

**Why it is here.** Two things are necessary, and they do not depend on which
library you use.

A sealed cookie cannot be cancelled. It stays valid until it expires and nothing
stops it. So "sign out from all devices" does not work, and "remove this person
from the studio" does not work. That is the prize. Keep it in front of you,
because it tells you when the work is correct.

A `user` row must also exist, because each D1 table that StudioOS adds uses a
user as a foreign key, and a cookie cannot be a foreign key.

**The decision inside this work is yours.** Does a library write those rows, or
do we? The Google sign-in button was one of the stronger reasons to use
better-auth, and that button is no longer in the work. So the question is open.

Read **[ADR-0003](./adr/0003-how-sessions-are-stored.md)**. It is given to you
unfinished, on purpose. It holds the question, the options, the evidence that is
correct today, and the rules that do not change. Complete it, set the status to
Accepted, and then write the code.

**Do this part first, before you decide.** Put every read and write of a session
behind one folder, `kernel/auth`. No route touches a session table directly. A
route asks `kernel/auth` who the person is and gets the user, the studio and the
ERPNext token. Then both options look the same from the outside, and to change
your mind later is one folder of work.

**What does not change, either way.**

- `worker/src/routes/auth.ts` does not move and is not rewritten. Read section 2
  of `docs/SEAM.md` for the three reasons.
- A library does not sign the person in. ERPNext OAuth stays as it is. A library
  would store users, sessions and tokens. You are choosing a store, not an
  authentication system.
- The ERPNext tokens never go in the cookie. The cookie holds one session
  identifier and nothing else.
- StudioOS gets no permission code. A session says who the person is. It never
  says what they may see.

**What else to do here.**

1. Bind D1. Add the tables your decision needs, and a `studio` table.
2. Change one step in the flow. At the end of `/auth/callback`, find or create
   the user, then create the session.
3. Write the ERPNext access token and refresh token to a table, with the user
   and the studio as the key.
4. Delete the `exclude` list from `worker/tsconfig.json`. D1 exists again, so
   those files must be type-checked again.

**Stop and ask.** If you find yourself writing a permission check inside
StudioOS, stop. This backend has no permission code and that is the design.

**Done when.** A person signs in with ERPNext and sees exactly what they saw
before. Then you delete their session row in D1, and their next request fails.
The second test is the one that matters.

---

## H3 — The front end conventions, and the Figma pipeline

**The goal.** Shubham gives you a Figma file. You and your agent make it into
code with little friction and with a result that looks the same each time.

**Why it is here.** It touches no Worker code, so you can do it at the same time
as H1 and H2. It is the one piece of work here that does not wait.

**What exists today.** The application already uses React 19, Vite, TypeScript,
Tailwind CSS v4, React Router 7, TanStack Query, React Hook Form with Zod,
Chart.js and date-fns. The features are already divided by folder in
`app/src/features/`. The gap is not the libraries. The gap is that nothing is
written down, so each new page is a new set of small decisions.

**The recommendation, and the decision is yours.**

- **Use shadcn/ui for the components.** The code is copied into the repository,
  not installed as a dependency, so you own it and can change it. It is built
  on Tailwind, which you already use. An agent knows this library well, which
  matters more here than it usually does.
- **Make the Figma variables into Tailwind theme tokens.** Tailwind v4 declares
  a theme in CSS with `@theme`. A colour or a spacing value from Figma becomes
  one token in one file. A component then names the token, not the value. When
  Shubham changes a colour, you change one line.
- **Write the conventions in `app/AGENTS.md`.** That file is the front end
  equivalent of the rules in the root `AGENTS.md`. Name the folder structure,
  the token names, which component to use for which job, and the rules about
  what a feature folder may import.

**What you decide.** All of the above. This is your area. The one rule that is
not yours to change is that a feature has the same name in `app/src/features/`
and in `worker/src/modules/`.

**Stop and ask.** Ask before you add a library that has its own design opinion,
such as Material UI or Chakra. Those libraries are difficult to make agree with
a Figma file, and the work to make them agree is larger than the work they save.

**Done when.** You take one screen from Figma and build it. Then you write down
what you did as the convention. Then you build a second screen and the
convention does not change.

---

## After these

| Work | What it does |
|---|---|
| Modules | The structure in ADR-0002. No change to behaviour. |
| Continuous integration | The boundary check, the `withDocAccess` check, the migration check. |
| Project notes | One small feature that proves the seam from end to end. |
| Deployment | Done as part of release 1. See `docs/DEPLOY.md`. |

---

## The three questions, again

Ask these for each new field, table, endpoint and migration.

1. Does this data stay if you delete StudioOS? Yes: ERPNext. No: D1.
2. Does a read of this data show information about an ERPNext document? Yes:
   use `withDocAccess`.
3. Does this need a credential when no user is present? Yes: **stop.**

Question 1 answers most decisions. Questions 2 and 3 exist because their
failures give no error message.

---

## How to work with your agent

The agent writes faster than you. Your work is the part it cannot do: to decide
if the thing that is being built must exist in that shape.

- Before you accept a change, ask the agent: *"which of the three questions does
  this touch, and what did you decide?"* If it cannot answer, the change is not
  ready.
- Give the agent the file to read, not the answer. Write "read `docs/SEAM.md`
  section 5, then write the endpoint" and not "add a permission check".
- When you and the agent disagree with a document, the document is sometimes
  wrong. Change the document first, in writing, with a reason. Do not go around
  it in the code.
- Write down what you decided not to do. A reader cannot reconstruct that later,
  and in three months you are that reader.
