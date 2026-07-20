# BidEasy — Operations runbook

Everything an operator must do that code cannot: deploys, secrets, database,
and disaster recovery. Nothing here contains secret values — only the names and
where they go.

## Deploy

- **Code**: merging to `main` auto-deploys to Vercel (~2 min). Merge only on a
  green `ci` check — never admin-override past red (CI runs unit tests, a
  production build, and Playwright e2e **under a non-superuser RLS role**).
- **Migrations do NOT run on deploy.** After the Vercel deploy lands, apply any
  new DB migrations against prod Neon:
  ```
  DATABASE_URL="<prod Neon url>" npm run db:migrate
  ```
  Order matters: **code first (Vercel, automatic), migrations second** — the app
  is written to tolerate a not-yet-applied migration, but not old code against a
  newer schema.

## Pending migrations to apply in prod

These are merged in code and must be applied once (idempotent, safe to re-run):

| Migration | Effect |
|---|---|
| `031_force-cost-items` | FORCE RLS on the rate library |
| `032_force-estimate-lines` | FORCE RLS on priced bid lines |
| `033_force-pii` | FORCE RLS on `intake_submissions` (homeowner PII) |
| `034_force-bid-tables` | FORCE RLS on estimates/versions/markups, projects, proposals, proposal_events |
| `035_force-remaining` | FORCE RLS on service areas, markups, benchmarks, ai_jobs, scope hints, enrichment, audit_log |
| `061_force-intake-photos` | FORCE RLS on `intake_photos` |

Because `FORCE` binds even the owner role Neon uses, these enforce isolation on
those tables **immediately on apply — no role swap required.** Run
`npm run db:migrate` once after the deploy; it applies all pending migrations in
order and is idempotent.

## Environment variables (Vercel → Settings → Environment Variables, Production)

Presence-check any of these live at `/api/env-status` (booleans only, never values).

| Variable | Purpose | Without it |
|---|---|---|
| `DATABASE_URL`, `DATABASE_URL_UNPOOLED` | Neon connection | app cannot start |
| `NEON_AUTH_*` | passwordless auth | sign-in fails |
| `MAIL_PROVIDER=resend`, `RESEND_API_KEY`, `MAIL_FROM` | live bid email | "send bid" falls back to copy-a-link (honest, but no email) |
| `MONITOR_WEBHOOK_URL` | error alerting (Sentry/Slack) | errors log to Vercel only; no proactive alert |
| `ENRICHMENT_PROVIDER=dc` | live DC address/permit lookups | enrichment is skipped |

**Never set `E2E_AUTH_SECRET` in production** — it is a CI-only auth bypass. It
is also code-guarded (inert when `VERCEL_ENV==="production"`), but do not set it.

## Tenant isolation (RLS) — current state

**Every table carrying `org_id` is now `FORCE`-RLS'd**, verified in CI by running
the full GC + buyer journey (and fresh-user provisioning) under a non-superuser
owner role: cost/estimate/proposal data, homeowner PII, config, benchmarks,
logs — all of it. A missing org context is caught by CI, not leaked in prod.

Intentionally app-scoped (not FORCE'd, by design):
- **identity / bootstrap** — `users`, `organizations`, `org_memberships` (read to
  establish the session before an org is known);
- **token / slug lookups** — `proposal_access_tokens`, `intake_links` (the
  unguessable token/slug IS the authorization; the app resolves the org from it,
  then scopes);
- **shared platform config** with nullable `org_id` — `cost_codes`, `assemblies`,
  `scope_assembly_map`, `assembly_modifiers`, `market_cost_items`, `counties`.

For enforcement in prod, run the app as a **non-superuser owner role** (Neon's
default `*_owner` role already is one) — CI proves the full journey works under
exactly that. `FORCE` binds the owner, so no separate role swap is needed.

## Backups / disaster recovery

- Neon provides point-in-time restore (PITR). **Confirm the retention window** in
  the Neon console meets your RPO; it is the primary recovery mechanism.
- `db:reset` is destructive and gated behind `DB_RESET_ALLOW_PROD` — never set
  that in prod.
- Rollback a bad deploy via Vercel's "Instant Rollback" to the previous
  deployment; roll back a bad migration by restoring Neon to a pre-migration
  timestamp (migrations here have no down-scripts).

## Monitoring

- `lib/monitor.ts#captureError` logs structured JSON (always, visible in Vercel
  logs) and POSTs to `MONITOR_WEBHOOK_URL` when set. Wire that URL to get alerts.
- Health: `GET /api/health` returns `{ ok: true }` (no DB dependency).
