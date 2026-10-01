# 0003. How sessions are stored

- **Status:** Accepted
- **Date:** 2026-09-26 (proposed), 2026-10-01 (accepted)
- **Owner:** Sandesh
- **Changes:** `docs/SEAM.md` section 2. See Amendment 3 in that document.

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

Use option B. StudioOS writes its own small session store in D1, behind
`kernel/auth`.

The conditions:

1. **All session code is in `worker/src/kernel/auth`.** No route and no module
   reads or writes a session table. A route calls `kernel/auth` and gets the
   user, the studio and the ERPNext token.
2. **The cookie holds one random session identifier.** The Worker makes it
   from 32 bytes of `crypto.getRandomValues`. The cookie is `HttpOnly`,
   `SameSite=Lax`, and `Secure` on an `https` origin.
3. **D1 stores the SHA-256 hash of the identifier, not the identifier.** A copy
   of the database then gives no session that operates.
4. **The ERPNext tokens are encrypted before they go in D1.** The Worker uses
   the same AES-GCM function that encrypts the client secrets in KV.
5. **Each session has a fixed expiry time of 14 days.** This is the same value
   as the sealed cookie. `kernel/auth` refuses a session after its expiry time.
6. **To cancel a session is to delete its row.** The next request with that
   cookie gets a 401.
7. **A `user` row is one ERPNext user on one studio.** The key is the studio
   and the ERPNext user id. One person on two studios is two `user` rows.
   Phase 8 decides if StudioOS links them.

## Why

**The strongest reason: better-auth gives us storage, and storage is the small
part.** better-auth does not sign the person in. ERPNext OAuth stays as it is.
So better-auth would write four tables for us. Those tables are approximately
200 lines of code here.

**The parts of better-auth that we want are in Phase 8.** These are the
`organization`, `member` and `invitation` tables, and sign-in with email. Phase
8 is not started. Condition 1 keeps the cost to change this decision at one
folder. So we can choose better-auth at Phase 8, with the facts of Phase 8.

**We keep the shape of the `user` and `studio` tables.** SEAM section 8 joins
the `studio` table to the tenant registry by `host`. With option B, no library
decides the direction of that join.

**We add no dependency.** Each D1 plugin of better-auth must be checked
separately, as the evidence above says. With option B, there is nothing to
check.

## What this costs

**We own each line of security code.** A mistake in the session store is a
security mistake. The tests in `worker/tests/` must prove the four items in
option B: the random source, the cookie flags, the expiry time, and deletion
that takes effect on the next request.

**Phase 8 has more work.** If Phase 8 chooses better-auth, the `user` and
`session` rows move to its tables. If Phase 8 does not choose it, we build the
`organization`, `member` and `invitation` tables ourselves.

**One person on two studios is two users until Phase 8.** A person who signs in
to two studios sees two separate StudioOS identities.

**D1 now holds ERPNext tokens.** Before this decision, StudioOS stored no token
of any person. The tokens are encrypted, and the key is a Worker secret, not a
D1 value. A copy of D1 alone gives no token. A copy of D1 and the secret gives
the tokens of each person with a session that has not expired.

**A refresh race stays.** Two requests at the same time can both refresh the
ERPNext token. If Frappe rotates the refresh token, the second refresh fails
and the person must sign in again. The sealed cookie has the same race. This
decision does not make it worse.

## How we know if this was wrong

Write a new ADR when one of these occurs:

- The session code in `kernel/auth` becomes larger than approximately 400
  lines, because we add a feature that a library already gives.
- Phase 8 needs sign-in with email or an invitation. Then compare option A
  again, with the D1 plugin checks for `organization`.
- A security review finds a fault in the session store that better-auth
  prevents.
