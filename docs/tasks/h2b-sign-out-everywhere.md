# H2b — sign out everywhere, and remove a person from a studio

**State:** Open
**Owner:** Sandesh
**Size:** small. Half a day.
**Comes after:** H2, which is merged.

## Read these first

1. `AGENTS.md` — the router.
2. `docs/adr/0003-how-sessions-are-stored.md` — your own decision. Conditions 1,
   6 and 8 are the ones this card uses.
3. `docs/SEAM.md` Amendment 4 — what StudioOS now stores, and why it matters
   here.

## The goal

Two operations exist and are proved:

- A person ends every session of theirs, in each browser, from one request.
- An operator ends every session of one person on one studio.

## Why this card exists

H2 made both possible and neither available. You wrote the capability: a
session is a row, and `idx_session_user` indexes `session(user_id)`, which is
the index these two operations need and nothing else uses yet.

The handoff named this as the prize of H2: *"sign out from all devices works,
and remove this person from the studio works."* The test in the card was
narrower, you met it, and the work is correct. This card finishes the sentence.

## The work

1. `POST /auth/logout-all`. End each session of the signed-in user, not only
   this one. Clear the cookie on this browser.
2. One function in `kernel/auth`, beside `endSession`. Do not write a query in a
   route. That is condition 1 of your own ADR.
3. Revoke at ERPNext in the same way `POST /auth/logout` does: best effort, and
   a failure there must not stop the sign-out here. Each session has its own
   ERPNext token, by condition 8, so there is more than one token to revoke.
4. The operator case: a function that takes a studio and an ERPNext user, and
   ends each session of that person. No endpoint yet. Phase 6d decides who may
   call it, and until then an endpoint with no permission rule is a fault.

## Do not break

- **No permission code in StudioOS.** This is the trap in this card. A person
  may end their own sessions. Who may end the sessions of a *different* person
  is a permission question, and `docs/SEAM.md` section 0 says StudioOS does not
  answer those. That is why step 4 is a function and not a route.
- **`kernel/auth` stays the one place.** No route reads or writes the session
  tables.
- **A failed revocation at ERPNext does not fail the request.** A person must
  always be able to sign out of StudioOS.
- **Do not add a column.** The rows you need are there.

## Verify

1. `bun run check`.
2. Extend `worker/scripts/check-session-cancel.ts`, or add a second script: sign
   in from two browsers, or with two cookie jars. Call `logout-all` with one.
   Prove the **other** cookie gets 401. That is the whole point, and a test with
   one cookie does not prove it.
3. Prove that a failure at ERPNext still signs the person out. Point the tenant
   at a host that does not answer, then sign out.

## Ask first

- Before you add an endpoint for step 4. That needs Phase 6d.
- If you find yourself writing "if the user is an admin". Stop. That is the
  permission code this repository does not have.

## Done when

- `POST /auth/logout-all` ends each session of the signed-in person, proved with
  two cookies.
- The operator function exists, is tested, and has no route.
- `docs/HANDOFF.md` H2 records it, with the date.
