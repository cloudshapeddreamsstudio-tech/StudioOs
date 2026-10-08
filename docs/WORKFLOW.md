# Workflow — branches, releases and migrations

This is how each person and each agent works in this repository. It is a
convention. Continuous integration will check parts of it later. Until then,
each person obeys it.

Written in ASD-STE100 Simplified Technical English. See `docs/adr/README.md`.

`docs/git-flow.html` is the same rule as a picture.

---

## The branches

| Branch | What it is | Deploys to |
|---|---|---|
| `main` | What production runs. Each commit on it is a release | **Production**, from a tag |
| `release/vX.Y.Z` | One release. A small set of changes, with a written scope | **Demo**, for the test |
| `feat/<name>` | One new feature. One card, one branch | Nothing |
| `fix/<name>` | One fault correction. One card, one branch | Nothing |

There is no `dev` branch. Demo runs the release branch. So the code that a
person tests is exactly the code that ships.

"Demo" and "staging" are one environment. People say demo, because the address
is `demoos`. The configuration and the Cloudflare names say `staging`.

---

## One release, step by step

1. **Open the release.** Create `release/vX.Y.Z` from `main`. Write its scope in
   `docs/releases/vX.Y.Z.md`: the cards that are in it. Keep it small.
2. **Do each card on its own branch.** Create `feat/<name>` or `fix/<name>` from
   `main`. One person or one agent works on one branch.
3. **Merge a finished branch into the release branch.** `bun run check` must
   pass first.
4. **Deploy the release branch to demo.** `bun run deploy:staging`. A person
   tests it there, in a browser.
5. **Malhar approves.** Then merge the release branch into `main`, tag the
   commit `vX.Y.Z`, and deploy production from the tag:
   `bun run deploy:production`.

The rules:

- **Production deploys only from a tag on `main`.** Not from a branch.
- **The commit that goes to production was on demo first.** If you change the
  release branch after the test, deploy it to demo and test again.
- **Never commit to `main` directly.** A change reaches `main` only through a
  release branch.
- **Start a `feat` or `fix` branch from `main`,** not from a different feature
  branch. Then it brings only its own change.
- **Only one release is in the demo test at one time.** There is one demo site.
  The next release waits. This is one more reason to keep a release small.

---

## The version number

`vMAJOR.MINOR.PATCH`.

| The release has | Change | Example |
|---|---|---|
| only fault corrections | PATCH | `v1.0.0` to `v1.0.1` |
| a new feature | MINOR | `v1.0.1` to `v1.1.0` |
| a change that a studio must act on, such as a new connector installation | MAJOR | `v1.4.2` to `v2.0.0` |

Go up one step at a time. Do not go from `v1.1.1` to `v1.4.3`. A release with
many changes is difficult to test and difficult to roll back.

---

## Roll back

A release has a fault in production. Do this:

1. **Deploy the previous tag again.** Check out the previous tag, then
   `bun run deploy:production`. Or use `bunx wrangler rollback --name
   studioos-production`, which is immediate.
2. **Correct the fault in a `fix/` branch,** and ship it as the next PATCH
   release, through demo.

Do not merge an old release branch into `main` to roll back. The old release is
already in `main`, so Git changes nothing.

A rollback changes the code only. It does not change the database. The
migration rule below makes that safe.

---

## Database migrations

D1 migrations are numbered SQL files in `worker/migrations/`. They are in Git.
Wrangler applies them in order and D1 records which ones are applied. No other
migration tool is used. A tool such as goose needs a network connection to the
database, and D1 has none.

**A migration only adds.** It can add a table, a column or an index. It does not
remove one and it does not rename one.

The reason: after a rollback, the previous code runs on the new database. If
the migration only added things, the previous code still operates.

To remove or rename something, use two releases:

1. Release A: the code stops using the old column. The column stays.
2. Release B, later: a migration removes the column.

Apply a migration before the deploy of the code that needs it:
`bun run db:migrate:staging`, or `bun run db:migrate:production`.

D1 keeps a point-in-time restore for 30 days. That is the last protection. It is
not the plan.

---

## ERPNext schema files

`erpnext/schema/` holds the custom fields that StudioOS needs on a studio's
ERPNext site. The rules are the same as for a D1 migration: a numbered file,
add-only, applied to the test site first and then to production, as part of a
release. `erpnext/README.md` has the procedure, and ADR-0005 has the five
conditions.

Before a deploy, check that the site has each file. A release that needs a
field that the site does not have fails with HTTP 417.

---

## Work in parallel

Each agent has one branch and one card, so two agents can work at the same
time. Some files are changed by almost each feature, and two branches that
change them will conflict:

- `worker/src/index.ts`, the route table
- `app/src/router.tsx` and `app/src/components/layout/Sidebar.tsx`
- the tables in `AGENTS.md` and `docs/tasks/README.md`
- `bun.lock`
- the next migration number in `worker/migrations/`

The rule: the branch that merges second corrects the conflict. For a migration,
it takes the next free number. The modules of ADR-0002 will remove most of
these shared files.

---

## For an agent

- Find your branch name before you change a file. If you are on `main` or on a
  release branch, stop and create a `feat/` or `fix/` branch from `main`.
- Do not merge, tag or deploy production. A person does that.
- Do not deploy demo from a `feat/` or `fix/` branch. Demo runs a release
  branch.
- A new migration only adds. If your change must remove or rename, stop and
  ask.
