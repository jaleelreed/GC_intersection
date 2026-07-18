# CLAUDE.md — GC_intersection

## Read first, in this order
1. `SESSION-CONTEXT.md` — decision ledger (D1–D12), invariants, session self-orientation. **Wins all conflicts.**
2. `build-plan-v2.md` — epics, stories, contracts, build order, session queue.
3. `docs/schema/` — table dictionary / DDL. Launch migrates domains 01, 07, 09 only.

## What this is
Zero-setup estimating for SMB residential-renovation GCs. Homeowner intake form → county-seeded draft estimate (range + swing drivers) → GC edits → every edit captured → next draft closer. The convergence loop is the company.

## Stack
Next.js · Neon PostgreSQL 16 + pgvector · RLS on all migrated tables.

## Invariants — check on every story
- Deterministic: same input → same output; every number traceable to seed, modifier, observation, or edit.
- Provenance everywhere: derived objects point at sources; AI output gets `ai_jobs` + `verified_by`.
- Versioned, never destructive; accepted estimate versions are immutable.
- Structured fields set price; narrative sets context only.
- Estimate lines: cost-code + unit basis + stable identity. Never flattened text+price.
- No payments, no money movement, no Group-1 features (budget/SOV/CO/pay-app). Do not scaffold them "helpfully."

## Commands
- Dev: `npm run dev`
- Test: `npm test` (must pass before any commit)
- DB reset: `npm run db:reset` (seeds fixed test account)
- Migrate: `npm run db:migrate`
(EP-00 establishes these; keep this section current.)

## Workflow, per story
`/build US-00N` → restate contract (build-plan-v2 §4 as amended by SESSION-CONTEXT §2) → plan → push back once → tests first → verify (tests + build) → commit `[US-00N] message` → PR with evidence → reviewer → handoff.

## Currently parked — do not implement
US-013 (1build), US-026 (decline path), US-005c full enrichment (ADR-2 open), anything payments-shaped, anything downstream-back-end-shaped.
