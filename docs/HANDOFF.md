# Handoff — the work ahead

This document is for Sandesh. It gives the next pieces of work, the order to do
them in, and the decisions inside each one that are yours to make.

`AGENTS.md` tells you how to work in this repository. This document tells you
what to build next and why that order is correct. When the two disagree,
`AGENTS.md` is correct, because it changes less often.

Written in ASD-STE100 Simplified Technical English, as all documents here are.
See `docs/adr/README.md`.

---

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

**What you decide.** Where `wrangler.jsonc` lives after this change. It points
at `../app/dist` and at `worker/src`, so the repository root is the natural
place. ADR-0002 expects it there.

**Stop and ask.** Nothing here needs a decision from Malhar. It is reversible
and nothing is deployed yet.

**Done when.** `bun run build` then `bunx wrangler dev` serves the SPA and
answers `/api/health` from one port. Sign-in still works.

---

## H2 — better-auth, on D1

**The goal.** better-auth owns the session. The ERPNext tokens move out of the
cookie and into the `account` table. Sign-in behaves exactly as it does today.

**Why it is here.** Two reasons, and the second one is the real one.

The first reason is that every D1 table needs a `user` row as a foreign key. A
stateless cookie cannot be a foreign key.

The second reason is that you cannot cancel a sealed cookie. Today a session
cookie stays valid until it expires and nothing stops it. After this change,
"sign out from all devices" works, and "remove this person from the studio"
works. That is the prize. Keep it in front of you, because it tells you when
the work is correct.

**The work.**

1. Add the D1 binding. Create the better-auth tables and a `studio` table.
2. Do **not** change the OAuth flow. `worker/src/routes/auth.ts` is 334 lines
   of correct Frappe code. Read section 2 of `docs/SEAM.md` for the three
   reasons not to move it into a better-auth plugin.
3. Change one step only. At the end of `/auth/callback`, find or create the
   better-auth user, then create a better-auth session. better-auth then owns
   the cookie.
4. Write the ERPNext access token and refresh token to the `account` table. Use
   the user and the studio together as the key. Never put a token in a cookie.
5. Delete the `exclude` list from `worker/tsconfig.json`. D1 exists again, so
   the files that use it must be type-checked again.

**What you decide.** The shape of the `studio` table, and how it joins to
better-auth's `organization` table. `host` is the key. Read section 8 of
`docs/SEAM.md` first: KV holds the client credentials because `requireSession`
reads them before the user is known, and D1 holds the rest.

**Stop and ask.** If you find yourself adding a permission check in StudioOS,
stop. This backend has no permission code and that is the design.

**Done when.** A person signs in with ERPNext and sees exactly what they saw
before. Then you delete their session row in D1, and their next request fails.
That second test is the one that matters.

---

## H3 — Sign in with Google

**The goal.** A person signs in with Google and reaches the application.

**Why it is here.** It needs H2. better-auth provides the Google provider, and
better-auth needs its tables first.

**The problem to solve before you write code.** A person who signs in with
Google has no ERPNext token. Section 2 of `docs/SEAM.md` says such a person sees
the interface and no data. That result is correct and it is not an error.

But read it again with a Google button on the sign-in page. That person is no
longer a rare case. They are the usual first visitor. An empty application is
now the usual first experience.

So Google sign-in is not a second way to reach the data. It is a way to reach an
account. The data needs a second step: **connect your studio's ERPNext.** Design
that step before you build the button, or you will build a sign-in that leads to
an empty screen.

**The question you must answer, and it is a security question.** One person can
sign in with Google today and with ERPNext tomorrow. Is that one account or two?

If you join them, join them only on an email address that the provider says it
verified. Google verifies email addresses. If you join accounts on an
unverified email address, a person who makes an account with another person's
email address takes control of that person's studio access. This is a known
attack and it has a name: account linking by unverified email.

Write your answer in an ADR before you write the code. It is the kind of
decision a code review does not catch.

**What you decide.** How the two buttons appear together, and what the person
sees after Google sign-in and before their studio is connected.

**Stop and ask.** Ask Malhar before you join two accounts by any rule other than
a verified email address.

**Done when.** A new person signs in with Google, sees a clear next step, and
connects their ERPNext. Then the same person signs in with ERPNext directly and
reaches the same account, not a second one.

---

## H4 — The front end conventions, and the Figma pipeline

**The goal.** Shubham gives you a Figma file. You and your agent make it into
code with little friction and with a result that looks the same each time.

**Why it is here.** It touches no Worker code, so you can do it at the same time
as H1, H2 and H3. It is the one piece of work here that does not wait.

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
| Deployment | Write `docs/DEPLOY.md` again. Do not follow the file that is there now. |

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
