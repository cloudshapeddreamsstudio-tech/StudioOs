# 0003. How sessions are stored

- **Status:** Proposed
- **Date:** 2026-09-26
- **Owner:** **Sandesh.** This decision is yours. Complete this document, change
  the status to Accepted, and then write the code.
- **Changes:** `docs/SEAM.md` section 2, if you choose differently from what it
  assumes.

> This ADR is given to you unfinished, on purpose. The question is real, the
> evidence below is correct as of 2026-09-26, and the decision is not made. Read
> it, add what you learn, write the decision and the reason, then build.

## The question

A session today is a sealed cookie. The cookie holds the ERPNext tokens. There
is no session row in a database.

Two things must change, and both are necessary whichever way you decide.

1. **A session must be possible to cancel.** A sealed cookie stays valid until
   it expires. Nothing stops it. So "sign out from all devices" does not work,
   and "remove this person from the studio" does not work.
2. **A `user` row must exist.** Each D1 table that StudioOS adds uses a user as
   a foreign key. A cookie cannot be a foreign key.

The question is not *if* sessions move to D1. The question is **what writes and
reads those rows**: the better-auth library, or approximately 200 lines that we
write here.

The Google sign-in button is no longer in the work. That button was one of the
stronger reasons to use a library, so the question is open again.

## What does not change, whichever way you decide

Read this section twice. These are the rules, not the options.

- **`worker/src/routes/auth.ts` does not move and does not get rewritten.** It
  is 334 lines of correct Frappe code. Section 2 of `docs/SEAM.md` gives three
  reasons. In short: StudioOS has a different OAuth provider for each studio,
  Frappe signs ID tokens with HS256, and this file already manages PKCE, the
  `state` parameter, the 301 discovery redirect on a bench, and the plain HTTP
  host list.
- **better-auth does not sign the person in.** This is the most important
  sentence in this document. Even if you choose better-auth, ERPNext OAuth stays
  exactly as it is. better-auth would store users, sessions and provider tokens.
  It would not perform the sign-in. You are choosing a store, not an
  authentication system.
- **The ERPNext access token and refresh token never go in the cookie.** They go
  in a table, with the user and the studio as the key.
- **The cookie holds one value: a session identifier.** Nothing else.
- **StudioOS gets no permission code.** ERPNext decides what a person may read.
  A session says who the person is. It never says what they may see.

## The evidence

These facts are correct as of 2026-09-26. Confirm them again before you decide,
because better-auth changes quickly.

**better-auth supports Cloudflare D1 directly.** Version 1.5, from February
2026, added D1 as a first-class database. You do not write an adapter.

**Its core tables are `user`, `session`, `account` and `verification`.** The
`account` table is where the ERPNext access token and refresh token would live.

**Its CLI generates a Drizzle schema.** This repository already uses
`drizzle-orm` and `drizzle-kit`, and it already has `worker/migrations/`. So the
generated schema fits the migration method that is here.

**D1 has no interactive transactions.** D1 wraps one query, or one `batch()`, in
a transaction. It does not let code open a connection and choose where the
transaction begins and ends. better-auth uses `batch()` for this reason.

**Some better-auth plugins cannot work on D1 at all.** The `scim` plugin refuses
to start unless the database reports native transaction support, which D1 can
never report. This is the nuance to carry forward: **the core library works on
D1, and each plugin must be checked separately.** Check the `organization`
plugin before you plan Phase 8 around it.

## The options

**A. Use better-auth.**

What it gives you: the `user`, `session` and `account` tables, tested session
handling, and the `organization`, `member` and `invitation` tables that Phase 8
needs for more than one studio. Also sign-in with email, an OTP or a magic link,
which a studio needs before its connector is installed, and which an invited
person needs when they have no ERPNext account.

What it costs you: better-auth owns the shape of those tables, so your `studio`
table joins to its `organization` table and not the opposite. You accept its
upgrades. You must check each plugin against D1. And you add a dependency to do
a job that, at today's size, is small.

**B. Write a small session store here.**

What it gives you: a `user` table, a `session` table, a cookie that holds only a
session identifier, and a row that you delete to cancel a session. That is both
of the necessary changes and no more. There is no dependency and no schema that
somebody else owns.

What it costs you: you own every line of it, and session handling is a place
where a small mistake is a security mistake. You must get all of these correct:
a session identifier from a cryptographic random source; a cookie that is
`HttpOnly`, `Secure` and `SameSite=Lax`; an expiry time; and deletion that
takes effect on the next request. You also build the Phase 8 tables yourself
when Phase 8 arrives.

**C. Keep the sealed cookie.**

This is not an option and it is written here so that nobody proposes it later.
It cannot be cancelled and it cannot be a foreign key. Those are the two things
that must change.

## How to make this decision cheap to change

Do this part first, whichever option you choose.

Put every read and write of a session behind one folder, `kernel/auth`. No route
and no module touches a session table directly. A route asks `kernel/auth` who
the person is, and gets back the user, the studio and the ERPNext token.

Then option A and option B are the same shape from the outside, and to change
your mind later is one folder of work instead of a rewrite. **A decision that is
cheap to change does not need to be correct the first time.** That is the most
useful thing in this document and it is not about authentication.

## The decision

*Write it here. One sentence, then the conditions.*

## Why

*Write the reason. Put the strongest reason first.*

## What this costs

*Write the costs, clearly enough that a reader can disagree with you.*

## How we know if this was wrong

*Write the signal that tells you to write a new ADR.*
