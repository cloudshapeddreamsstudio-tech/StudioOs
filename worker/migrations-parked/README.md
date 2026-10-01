# Parked ledger migrations

These two files make the six ledger tables of the old application: expenses,
crew, subscriptions, transactions, studio rental and brand.

They are **not applied** to the D1 database. `wrangler.jsonc` points
`migrations_dir` at `migrations/`, not at this folder.

The reason is `docs/SEAM.md` section 1. Most of this data goes to ERPNext, not
to D1. Brand is the one data set that D1 holds. When the phase for a data set
starts, that phase decides its table. Do not apply these files to make a parked
route operate.

`worker/seed.sql` holds the data for these tables. Do not delete it. Its header
gives the reason.

`drizzle.config.ts` writes here, because `src/db/schema.ts` describes these
tables and nothing else.
