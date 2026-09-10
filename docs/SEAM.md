# SEAM — the division between ERPNext and StudioOS

This document gives the direction for version 1 of StudioOS on Cloudflare. It
covers better-auth, Resend, and D1.

This document gives rules. It does not give tasks. Each rule answers one
question: where does this data go? The rules also protect the security property
in Section 0.

This document replaces the open question in Phase 10f of `PLAN-v2.md`. It does
not replace `SPEC.md`.

**Note on the language.** This document uses ASD-STE100 Simplified Technical
English. Sentences are short. Each word has one meaning. **Seam** is a technical
name in this document: the seam is the division between the data in ERPNext and
the data in StudioOS.

---

## 0. Why this application has no permission code

> **Each read and each write of studio data uses the access token of the person
> who signed in. StudioOS does not hold a credential that can read the accounts
> of a studio.**

The backend has approximately 7000 lines. No line decides if a user can see a
document. ERPNext makes that decision before the data comes to StudioOS.

This is the purpose of the rule. The rule is not only a security preference. It
removes a full category of code from the application.

### What the rule gives you

**A safe failure mode.** A contributor adds a new endpoint and forgets the
permission check. With this rule, the user sees too little data. That fault is
visible, and the user reports it. Without this rule, the user sees the data of a
different person. That fault is not visible, and nobody reports it.

This is most important for changes that an AI agent makes. An agent does not
hold the full context of the application. One forgotten line must not cause a
data leak.

**One location to debug.** A user says "I cannot see project X". There is one
question: what does ERPNext permit for this user? There is no second permission
model, no cache, and no synchronization to examine.

**Limited damage from an attack.** If an attacker gets full control of StudioOS,
the attacker gets no studio data. StudioOS holds no credential that reads it.

### What the rule costs you

These costs are real. Read them before you agree to the rule.

- A scheduled task cannot read ERPNext. The task has no user, thus it has no
  token. Section 7 is a direct result of this rule.
- Features that operate when the user is absent are difficult. Examples are
  payment reminders and reports at night.
- A person that you invite, who has no ERPNext account, sees the application
  interface and no data.

Accept these costs. Do not remove the rule to prevent them.

### How the rule breaks

One sentence starts the failure: "we need a service account for this task".

If a change needs StudioOS to hold a credential that reads studio data when no
user is present, the design is incorrect. Change the design. A code review
cannot correct it.

### Why this is Section 0

Section 1 tells you where the data lives. Section 0 tells you who can read the
data. An error in Section 1 makes an application that is difficult to maintain.
An error in Section 0 makes a data leak.

*History: Phase 6c removed the admin key to get this property. See
`PLAN-v2.md`. The history is the origin of the rule. It is not the reason for
the rule.*

---

## 1. The seam rule

One test applies to each item of data in the product:

> **ERPNext holds the data that stays if you delete StudioOS.
> D1 holds the data that goes if you delete StudioOS.**

Think about this condition: you delete StudioOS tomorrow. The projects, the
invoices, the payments, the customers, and the stock of the studio stay in
ERPNext. The accountant can use them. This is the back office. ERPNext is the
system of record.

This data also goes: the list of StudioOS users, the columns that a user
selected, the note that a user wrote about a shoot, and the brand colors of the
studio. You lose no records, because this data was never a record. This is the
front office. D1 holds it.

### The division of the data

| ERPNext holds | D1 holds |
|---|---|
| Project, Task, Customer, Supplier | user, session, account, organization, member, invitation |
| Sales Invoice, Payment Entry, Purchase Order | studio (the tenant), connector status |
| Item, Stock, Sales Person, Project Type | saved views, filters, selected items, column preferences |
| All data with money, tax, or an audit record | notes, checklists, and an internal status that ERPNext does not have |
| All data that the accountant of the studio opens ERPNext to see | brand files, moodboards, links to deliverables |
| | the email log (Resend message ids and status) |
| | the log of StudioOS operations |
| | caches (Section 4) |

### This answers Phase 10f

These are the six data sets from Phase 10f. The rule gives the answer for each
one.

| Data set | Answer | Location |
|---|---|---|
| Expenses | money, with an audit record | ERPNext — Purchase Invoice or Expense Claim |
| Transactions | money, with an audit record | ERPNext — Journal Entry or Payment Entry |
| Subscriptions | money, at regular intervals | ERPNext — Subscription and the invoice that it makes |
| Studio rental | money | ERPNext — Item and Sales Invoice. **D1 holds the booking calendar** |
| Crew | Phase 10f decided this | ERPNext — a Draft Purchase Order for each member. **D1 holds the rates and the availability** |
| Brand | goes with StudioOS | D1 |

Two of these data sets divide across the seam. This is correct. ERPNext holds
the money. StudioOS holds the schedule and the presentation. A rental booking
with no invoice is a row in D1. When you make the invoice, ERPNext holds the
money data, and D1 keeps only the reference.

---

## 2. Identity and authority are different

better-auth and ERPNext answer two different questions. Do not mix them. If you
mix them, you lose the rule in Section 0.

| | Question | Answer comes from | Storage |
|---|---|---|---|
| **Identity** | Who is this person? Does this person have a StudioOS account? Which studio is this person a member of? | better-auth | D1 |
| **Authority** | Can this person see PROJ-0042? | ERPNext | No storage. StudioOS asks ERPNext for each request. |

**A better-auth session does not give access to data.** It gives access to the
application interface. ERPNext decides what the person sees in that interface.
ERPNext uses the access token of that person to make the decision.

### Do not change the ERPNext sign-in flow

Do not move the ERPNext sign-in to the `genericOAuth` plugin or to the `sso`
plugin of better-auth. There are three reasons. I examined the better-auth
documentation for each reason.

1. You configure `genericOAuth` providers one time, at start. StudioOS has a
   different provider for each studio. Each studio has a different issuer and
   different client credentials. better-auth does not support a different
   provider for each request.

2. The `sso` plugin registers a different provider for each organization. But
   the `sso` plugin also verifies the ID token, the issuer, and the `sub` claim.
   Frappe signs ID tokens with HS256. The file `auth.ts` records this problem.
   `auth.ts` does not request the `openid` scope. `auth.ts` asks the site for the
   identity of the user with `frappe.auth.get_logged_user`. This method is
   better, because the site answers about the token that StudioOS holds.

3. `routes/auth.ts` has 334 lines of correct code for Frappe. The code manages
   the 301 redirect for discovery on a bench, and the 200 response on Frappe
   Cloud. The code manages the list of hosts that permit plain HTTP. The code
   manages PKCE and the `state` parameter. If you write this code again for a
   plugin, you will cause errors.

**Do this instead.** Keep the ERPNext OAuth flow. Do not change it. At the end
of `/auth/callback`, the code seals a cookie. Change only this step: find or
create the better-auth user, then create a better-auth session. better-auth then
controls the cookie.

Put the ERPNext access token and the refresh token in the `account` table of
better-auth. Use the user and the studio as the key. Do not put the tokens in
the cookie.

This gives you one important function: you can cancel a session. Today a sealed
cookie is valid until it expires, and you cannot stop it. After this change,
"sign out from all devices" operates correctly. "Remove this person from the
studio" also operates correctly.

### Why StudioOS needs better-auth

- A `user` row. Each D1 table uses this row as a foreign key. A stateless cookie
  cannot be a foreign key. This reason is sufficient.
- The `organization`, `member`, and `invitation` tables. These tables give the
  model for more than one studio. This is Phase 8.
- Sign-in with email, with an OTP or a magic link. The ERPNext OAuth flow cannot
  do two things: it cannot start a studio before the installation of the
  connector, and it cannot invite a person who has no ERPNext account. Such a
  user gets the application interface and no data, because the user has no
  ERPNext token. This result is correct. It is not an error.

To configure the database, give the D1 binding to better-auth:
`database: env.DB`. D1 has no interactive transactions. better-auth uses the
`batch()` function to keep the data correct.

---

## 3. How a D1 row refers to an ERPNext document

Use these three columns. Always use all three columns.

```sql
studio_id     TEXT NOT NULL REFERENCES studio(id),  -- which ERPNext site
erp_doctype   TEXT NOT NULL,                        -- 'Project'
erp_name      TEXT NOT NULL,                        -- 'PROJ-0042'
```

**The `studio_id` column is necessary. You cannot calculate it.** The document
`PROJ-0042` exists on the site of each customer. If you make an index on
`(erp_doctype, erp_name)` and you do not include the studio, you show the private
notes of one studio on the project of a different studio. Each index on these
columns must start with `studio_id`.

Example:

```sql
CREATE TABLE project_note (
  id          TEXT PRIMARY KEY,
  studio_id   TEXT NOT NULL REFERENCES studio(id),
  erp_doctype TEXT NOT NULL,
  erp_name    TEXT NOT NULL,
  author_id   TEXT NOT NULL REFERENCES user(id),
  body        TEXT NOT NULL,
  created_at  INTEGER NOT NULL
);
CREATE INDEX idx_project_note_doc
  ON project_note (studio_id, erp_doctype, erp_name, created_at DESC);
```

### Do not copy the values of ERPNext fields into D1

Do not copy `project_name`, `customer`, `status`, or `grand_total`. Do not copy
them for a list page. If one value has two sources, one source is incorrect, and
the client tells you. Keep the reference. Read the values from ERPNext.

Section 4 gives the only exception.

### The reference goes in one direction only

D1 refers to ERPNext. ERPNext does not refer to D1. **Do not add custom fields to
ERPNext doctypes in version 1.** If you add `custom_studioos_id` to the Project
doctype, you must then maintain a Frappe application. You must manage
migrations, different versions, and an installation step on the site of each
customer. ERPNext must not know about StudioOS.

*Known limitation in version 1:* a user can change the name of a Frappe
document. The D1 row is then not valid. Accept this limitation in version 1.
Record it. Do not correct it now. A later version can correct the names with a
webhook.

---

## 4. Give a cache a name that shows that it is a cache

Sometimes you must copy ERPNext data into D1. One example is a dashboard that
makes 40 requests. A different example is a scheduled task that needs the data
from the previous day. This is permitted if you obey three conditions:

1. The name of the table starts with `cache_`.
2. The table has a `fetched_at` column. The code has a written procedure to make
   the table again.
3. Do not use the table as the source of truth in a join. Do not write the data
   back to ERPNext.

If the cache and ERPNext are different, ERPNext is correct and the cache is not
current.

If a procedure writes to a `cache_` table, the table is not a cache. Change its
name, or delete it.

---

## 5. Permissions at the seam

This is the most important control in this document. If you do not obey it, you
get no error message.

D1 rows have no ERPNext permissions. A person who cannot see `PROJ-0042` in
ERPNext can read the StudioOS notes for `PROJ-0042`. You must prevent this.

> **Each read of D1 data that refers to an ERPNext document must first read that
> document from ERPNext. Use the access token of the person who signed in. Do
> this in the same request.**

Read the ERPNext document first. ERPNext sends a 403 or a 404 response if the
person cannot see the document. Then read the D1 data. Do not change this
sequence. Do not do the two operations at the same time.

```ts
/**
 * Control access to StudioOS data with the permissions of ERPNext.
 *
 * The getDoc call is the permission check. ERPNext sends a 403 or 404 response
 * for a document that this user cannot see. That is also the correct response
 * for the StudioOS data about the document. StudioOS thus keeps no permission
 * logic of its own -- it only waits for the answer from ERPNext. This keeps the
 * property from middleware/requireSession.ts.
 */
async function withDocAccess<T>(
  c: Context<AppEnv>,
  doctype: string,
  name: string,
  fn: (studioId: string) => Promise<T>,
): Promise<T> {
  await c.get('frappe').getDoc(doctype, name);
  return fn(c.get('studioId'));
}
```

This function has four lines. Use it in each endpoint that reads StudioOS data
about an ERPNext document. If you want to omit it for one endpoint, discuss this
in a code review.

---

## 6. Email: two senders and one rule

> **StudioOS sends email about StudioOS. ERPNext sends email about money.**

Send with **Resend**, from the StudioOS domain: sign-in links, OTP codes,
invitations to a studio, alerts about a connector that stopped, and product
messages.

Send with **ERPNext**: invoices, receipts, payment reminders, and statements.
ERPNext sends all email that the accountant of a client receives.

Do not send invoices from StudioOS in version 1. Two senders for one invoice
give two audit records. They also divide the email reputation of the domain. The
accounts department of the client then receives money email from an unknown
domain. When StudioOS must send an invoice, StudioOS starts the send function of
ERPNext.

Record each Resend operation in D1. Record the message id, the template, the
recipient, and the status. The Resend dashboard cannot show this data for one
studio. In the first week, a person asks you if an invitation went out.

---

## 7. Do not use ERPNext when no user is present

This section is a consequence of Section 0. It is not a separate decision.

A scheduled task has no user. Thus it has no token. Thus it has no permissions.
Therefore:

- A scheduled worker **can** read D1, read `cache_` tables, and send email.
- A scheduled worker **must not** call ERPNext.

This rule is strict. It prevents the return of the admin key. The first step to
an admin key is this sentence: "the reminder task must read the invoices".

If you need ERPNext access with no user later, make a separate design. An owner
of a studio must give permission. Use the refresh token of that owner. Record
the design as an exception to Section 0. Do not add a `FRAPPE_API_KEY` variable.

---

## 8. Cloudflare: one Worker and one origin

Today the SPA and the API deploy separately. This gives two origins. Two origins
cause cookie errors and CORS errors. These errors occur only in production.

Make them one. One Worker sends the SPA files and also runs the API. This
configuration is correct:

```toml
main = "src/index.ts"

[assets]
directory = "../frontend/dist"
not_found_handling = "single-page-application"
binding = "ASSETS"
run_worker_first = ["/api/*", "/auth/*"]
```

The `run_worker_first` line is important. It sends `/api/*` and `/auth/*` to
Hono. Without this line, Cloudflare uses the `Sec-Fetch-Mode` header to make the
decision. The OAuth callback is a browser navigation. Cloudflare then sends
`index.html` and the callback does not reach the Worker. This configuration
needs Wrangler version 4.20 or higher.

This change removes a group of errors. `APP_UI_ORIGIN` then becomes the same as
`APP_ORIGIN`. You can then remove the difference between development and
production in `auth.ts`.

### You cannot change APP_ORIGIN later

The OAuth redirect URI comes from `APP_ORIGIN`. StudioOS registers this URI on
the ERPNext site of each customer. If you change `APP_ORIGIN` later, each
customer must install the connector again.

Select the production hostname before the first customer registers. The first
deploy is not the limit. The first customer is the limit. An error here has the
highest cost in this document.

### The tenant registry: KV holds the secret, D1 holds the studio

Do not move all the registry data to D1. Divide the data. Use two questions: who
reads the data, and when?

- **KV** holds `clientId` and `encryptedSecret`. The key is the host.
  `requireSession` reads this data with `getTenant` on each request, before
  authentication. KV is fast at the edge. The data changes only at installation,
  so eventual consistency is correct here.
- **D1** holds the `studio` row: id, name, erpnext_host, owner, connector status,
  and plan. StudioOS reads this data after authentication, and joins it to the
  `organization` table of better-auth.

`host` is the key for the join. The file `lib/tenants.ts` does not change.

---

## 9. The sequence of work

Do the steps in this sequence. Do not start a step before you complete the
previous step.

1. **Agree to this document.** If you do not agree, change this document. Do not
   write different code.
2. **Make one Worker and one origin.** Use static assets and `run_worker_first`.
   Set `APP_ORIGIN` to the production hostname. Change Wrangler from version 3
   to version 4.
3. **Add D1 and better-auth.** Make the better-auth tables and the `studio`
   table. Connect the current oauth4webapi callback to a better-auth session.
   Move the ERPNext tokens to the `account` table. Sign-in must operate the same
   as before. This is the test of success.
4. **Prove the seam with one feature.** Use project notes. This feature uses the
   three columns from Section 3 and the `withDocAccess` function from Section 5.
   One small feature that establishes these two patterns is better than five
   features with five different patterns.
5. **Add Resend** for invitations and OTP codes only. Add the email log.
6. **Deploy.** Write `DEPLOY.md` again. `DEPLOY.md` still describes the API key
   that Phase 6c removed.

Do the six data sets of Phase 10f after all these steps, and use Section 1. They
are the result of the seam. They are not part of its construction.

---

## 10. The checklist

Ask three questions for each new field, table, and endpoint.

1. **Does this data stay if you delete StudioOS?** Yes: put it in ERPNext. No:
   put it in D1.
2. **Does a read of this data show information about an ERPNext document?** Yes:
   use `withDocAccess`.
3. **Does this need a credential when no user is present?** Yes: stop. Make a
   different design.

Question 1 answers most decisions. Questions 2 and 3 find the problems that
cause damage with no error message.

---

## Decisions that this document does not make

These items stay open. The first version must answer them. Do not estimate the
answers now.

- **Roles.** The `organization` plugin of better-auth has roles. ERPNext has
  different roles. Do not build a StudioOS role model until you find a
  requirement that ERPNext cannot supply. This is Phase 6d.
- **A user changes the name of a document, and the D1 row becomes not valid**
  (Section 3). Accept this in version 1.
- **ERPNext access when no user is present** (Section 7). Make this design when
  you need it.
- **Webhooks from ERPNext for immediate updates.** Not in version 1. Requests
  and caches are sufficient for this quantity of data.
