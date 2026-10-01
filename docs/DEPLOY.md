# Deploy StudioOS

This is the procedure to deploy one environment of StudioOS. Do it for
`staging` first. Do it for `production` only after the staging sign-off in
`docs/tasks/r1-staging.md`.

> **State:** written 2026-10-02 from the configuration and a dry-run deploy. It
> was not yet run against Cloudflare. The first person who runs it corrects it
> in the same change. A step that does not operate is a fault in this file.

Written in ASD-STE100 Simplified Technical English.

---

## The two environments

| `ENV` | StudioOS address | ERPNext site | Worker | D1 database |
|---|---|---|---|---|
| `staging` | `demoos.cloudshapeddreamsstudio.com` | `cloudshapeddreamsstudio.m.erpnext.com` | `studioos-staging` | `studioos-staging-db` |
| `production` | `studioos.cloudshapeddreamsstudio.com` | `csdstudio.frappe.cloud` | `studioos-production` | `studioos-production-db` |

In each command below, write `staging` or `production` where you see `ENV`.

---

## Before you start

- You can sign in to the Cloudflare account that holds the
  `cloudshapeddreamsstudio.com` zone.
- You are a System Manager on the ERPNext site of the environment.
- `bun run check` passes on your branch.
- You have a password manager open. You make three secrets for each
  environment, and you keep them there.

```bash
cd worker
bunx wrangler login
bunx wrangler whoami
```

---

## Steps that you do one time for each environment

### 1. Create the D1 database

```bash
cd worker
bunx wrangler d1 create studioos-ENV-db
```

Copy the `database_id` from the output. In `worker/wrangler.jsonc`, in the
`env.ENV` block, replace `REPLACE_WITH_ID_FROM_WRANGLER_D1_CREATE_ENV`.

### 2. Create the KV namespace

```bash
bunx wrangler kv namespace create TENANTS --env ENV
```

Copy the `id`. In the `env.ENV` block, replace
`REPLACE_WITH_ID_FROM_WRANGLER_KV_CREATE_ENV`.

### 3. Set the company name

On the ERPNext site, open the Company list. Copy the exact name of the company.
In the `env.ENV` block, set `COMPANY` to that name. A new project is created
under this company. A wrong name makes project creation fail.

Staging is already set to `Cloud Shaped Dreams Studio`. Confirm it. Production
has a placeholder.

Commit the changes to `wrangler.jsonc`. The ids are not secrets.

### 4. Apply the migrations

From the repository root:

```bash
bun run db:migrate:ENV
```

The output shows `0000_sessions.sql` with a tick.

### 5. Deploy

From the repository root:

```bash
bun run deploy:ENV
```

This builds the SPA and the Worker for that environment, then deploys them.
Cloudflare attaches the custom domain. The first time, the certificate can
take some minutes.

The output can show this warning. It is not a fault:

```
Unexpected fields found in top-level field: "connect","k2"
```

Check:

```bash
curl https://<StudioOS address>/api/health
```

The answer is `{"ok":true,"registryBound":true,"appOrigin":"https://<StudioOS address>"}`.

### 6. Set the three secrets

Make three new values. **Never use the same value in two environments.** A
staging secret that leaks must not open production.

```bash
bun -e "console.log(Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString('base64'))"
```

Run that three times. Keep each value in the password manager, with the name of
the environment. Then:

```bash
cd worker
bunx wrangler secret put SESSION_KEY --env ENV
bunx wrangler secret put REGISTRY_KEY --env ENV
bunx wrangler secret put CONNECTOR_SHARED_SECRET --env ENV
```

Wrangler asks for each value. Paste it. It is not written to a file.

`SESSION_KEY` encrypts the ERPNext tokens in D1. Treat it like an admin key.
Read `docs/SEAM.md` Amendment 4.

### 7. Connect the ERPNext site

This is done by hand. `docs/PLAN-v2.md` D2.

**7a. On the ERPNext site**, as a System Manager, create an **OAuth Client**:

| Field | Value |
|---|---|
| App Name | `StudioOS ENV` |
| Redirect URIs | `https://<StudioOS address>/auth/callback` |
| Default Redirect URI | `https://<StudioOS address>/auth/callback` |
| Grant Type | `Authorization Code` |
| Response Type | `Code` |
| Scopes | `all` |

Save it. Copy the **Client ID** and the **Client Secret**.

The redirect URI must be exact. The StudioOS address of staging goes only on
the staging ERPNext site. The StudioOS address of production goes only on the
production ERPNext site.

**7b. Register the site with StudioOS.** Put the values in a file, not on the
command line, so that they are not kept in your shell history:

```bash
cat > /tmp/register.json <<'JSON'
{ "host": "<ERPNext site>", "clientId": "<Client ID>", "clientSecret": "<Client Secret>" }
JSON

curl -X POST https://<StudioOS address>/auth/register \
  -H "content-type: application/json" \
  -H "x-connector-secret: <CONNECTOR_SHARED_SECRET of this environment>" \
  --data @/tmp/register.json

rm /tmp/register.json
```

The answer contains `"registered":true`.

### 8. Check the routing

From the repository root:

```bash
bun run worker/scripts/check-one-origin.ts https://<StudioOS address>
```

All five checks show `ok`.

### 9. Sign in

Open `https://<StudioOS address>`. Select sign in. Type the ERPNext site. Sign in
on ERPNext. Approve the consent screen. You arrive on the dashboard.

---

## A deploy after a change

From the repository root:

```bash
bun run db:migrate:ENV    # only if the change adds a migration
bun run deploy:ENV
```

---

## Roll back

```bash
cd worker
bunx wrangler deployments list --name studioos-ENV
bunx wrangler rollback --name studioos-ENV
```

A rollback changes the code only. It does not undo a D1 migration. So a
migration must work with the previous version of the code, or you cannot roll
back.

---

## Do not

- Do not put a secret in `wrangler.jsonc`, in a commit, or in a chat.
- Do not share `app/dist/`. `vite build` copies `worker/.dev.vars` into it.
- Do not register the production ERPNext site on staging, or the staging
  ERPNext site on production.
- Do not add `FRAPPE_API_KEY` or any ERPNext credential. Each request runs on
  the token of the person who signed in. `docs/SEAM.md` section 0.
