# Migrations — conventions, safety, and rollback

## How they run
- Files in `db/migrations/*.sql`, applied in filename order by `scripts/db/migrate.mjs`,
  tracked in `schema_migrations` (each file applied once, transactionally).
- On merge to `main` touching `db/migrations/**` or `scripts/db/**`, the **db-migrate**
  workflow runs: a `validate` job applies every migration from scratch against a throwaway
  Postgres + runs the smoke tests, and only if that passes does `migrate` touch Neon.
- CI (the `ci` workflow) also applies + resets the full schema on every PR, so a broken
  migration fails a PR before it can merge.

## Conventions
- **Additive and forward-only.** New tables, columns, enums, policies. Never edit a shipped
  migration file (it's already applied on prod and won't re-run).
- **Idempotent where it matters** (the `090` platform blocks, RLS re-application) — guard with
  `IF NOT EXISTS` / `DROP POLICY IF EXISTS` so re-runs are safe.
- **Number with room**: `NNN_name.sql`. Platform re-application blocks stay at `090` so they
  run last.
- When a migration file lands, add its filename to the ordered list asserted in
  `tests/db.smoke.test.ts` (the tripwire that the set is exactly as intended).

## Rollback
There are **no down-migrations** (they're a common source of prod incidents). To reverse a
change:
1. **Data mistake / bad deploy:** restore via **Neon's point-in-time recovery** (branch the
   database to a timestamp before the migration, then repoint `DATABASE_URL`). This is the
   fastest true rollback and loses no unrelated data written since only if you accept the PITR
   window — prefer #2 for schema-only issues.
2. **Schema mistake:** ship a **new corrective forward migration** (e.g. `061_drop_bad_column.sql`)
   rather than editing history. Forward-only keeps `schema_migrations` honest across every
   environment.
3. **Never** hand-edit prod schema out of band — the next migration run would diverge.

## Writing a risky migration
- Add columns nullable (or with a default) so existing rows validate.
- For a NOT NULL backfill: add nullable → backfill in the same file → set NOT NULL.
- For an index on a large table, note that this codebase is small; if that changes, use
  `CREATE INDEX CONCURRENTLY` in a standalone migration (it can't run inside the migrate
  runner's transaction — split it out and document it).
