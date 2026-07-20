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
| `061_force-intake-photos` | FORCE RLS on `intake_photos` |

Because `FORCE` binds even the owner role Neon uses, these enforce isolation on
those tables **immediately on apply — no role swap required.**

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

DB-enforced (`FORCE` RLS, verified in CI under a non-superuser role):
`cost_items`, `estimate_lines`, `intake_submissions`, `intake_photos`,
`lead_notes`, `notifications`.

Still application-scoped (tested `WHERE org_id = $1`, owner-bypass): the bid
*summary* tables (`estimates`, `estimate_versions`, `proposals`), config, and
logs. Extending `FORCE` to these is the same staged, CI-proven pattern; token
tables (`proposal_access_tokens`, `intake_links`) stay app-scoped by design (an
unguessable token/slug is the authorization).

For maximum enforcement in prod, run the app as a **non-superuser owner role**
(Neon's default `*_owner` role already is one) — CI proves the full journey
works under exactly that.

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
