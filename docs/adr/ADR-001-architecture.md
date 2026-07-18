# ADR-001 — Architecture confirmation + ratification of D1 / D7 / D8

**Session:** B2 architecture (`spec-architecture`, session queue #1)
**Date:** 2026-07-18
**Status:** Accepted (with one recorded blocker, §5)
**Inputs:** SESSION-CONTEXT.md (decision ledger, wins conflicts) · build-plan-v2.md · CLAUDE.md

---

## 1. Decision

The stack is confirmed as specified. No changes proposed.

| Layer | Choice | Rationale |
|---|---|---|
| App framework | **Next.js** | One codebase serves all four surfaces this product needs: the hosted intake form (embed + direct-link skins from one component set, D5/D12), the GC platform (notification, editor), the buyer bid view (EP-05), and the API routes behind them. Server-rendered pages keep the direct-link/QR surface fast on homeowner phones; the embed ships as a script tag (D12). Vercel-native deploy keeps EP-00 (preview deploy per branch, US-003) a config exercise, not an infrastructure project. |
| Database | **Neon PostgreSQL 16** | The 103-table dictionary is already Postgres-shaped DDL. Neon gives branch databases, which is what makes US-003's preview-deploy-per-branch and US-004's one-command reset cheap. |
| Vector | **pgvector** (extension, same database) | Carried for narrative extraction's downstream use (US-005b scope hints; future similarity over observations). No separate vector store — it is an extension enabled at migration time, costs nothing until used, and avoids a second data system nothing at launch justifies. **No launch story depends on vector search; do not build one to justify the extension.** |
| Tenancy / access | **RLS on every migrated table** | Invariant §4.5. Cost data never pools across GCs; row-level security is the architectural enforcement, not an application-layer convention. Fixed test account seeded by US-004. |
| Launch migration scope | **Domains 01, 07, 09 only** (~15–20 of 103 tables) | The other domains are Group-1 / downstream-shaped (D6, D11). Migrating them "while we're in there" is exactly the scaffolding CLAUDE.md forbids. |

### Explicitly not in the stack at launch

- No payment rails or provider SDKs (D6).
- No separate vector database, queue, or cache tier — Postgres does all of it until a measurement says otherwise.
- No budget/SOV/CO/pay-app tables (D11). D7 + D8 below are what keep that door unlocked without building behind it.

---

## 2. Ratified: D1 — the estimate-class gate

**Concept estimates NEVER convert to budget/SOV. This is a hard gate, enforced in schema and code, not a guideline.**

- Every estimate row carries a `class` provenance field: `concept | plan_derived | contracted`. Launch ships `concept` only.
- Concept output is a **range with named swing drivers**, never a point. Answer completeness drives band width; unknowns widen the range and never default silently (D3, US-011).
- There is **no code path** from a concept estimate to budget/SOV structures at launch — none exist to convert into (D11). When plan-derived estimates arrive (intersection roadmap), conversion eligibility keys off `class`, so the gate survives the roadmap.
- **Build error, not review comment:** any migration, endpoint, or UI affordance that treats a concept estimate as a budget source fails review outright.

## 3. Ratified: D7 — the immutable accepted-bid snapshot

**Acceptance freezes an estimate version nothing can mutate.**

- Acceptance (US-025) is a first-class timestamped event with a clean state machine — a state change only, no money movement (D6).
- The accepted estimate **version** becomes immutable: no UPDATE path in the application, and the schema enforces it (immutability trigger or equivalent constraint on accepted versions — mechanism finalized in US-002 against the real DDL).
- Versioning is never destructive (invariant §4.3): edits after acceptance create new versions; the accepted snapshot is "original scope" for any future downstream audit.
- Cheap now, unfixable retroactively — which is why it is ratified at architecture time rather than discovered at EP-05.

## 4. Ratified: D8 — structurally convertible estimate lines

**Every estimate line carries, at every class and every version:**

1. **Cost-code / trade classification** — never a bare description.
2. **Unit basis** — `qty × unit × unit_price`, never lump `text + price`.
3. **Stable line identity across versions** — a line edited in v3 is traceably the same line seeded in v1; this is also what makes US-019's `benchmark_observation` capture and US-022's edit-distance metric computable.

- **A flattened text+price line is a build error** (invariant, US-012b), caught in review and by tests, not cleaned up later.
- This is the launch-domain guarantee that future budget/SOV/sub-scope conversion (D11, intersection roadmap) needs — the door stays unlocked without any Group-1 table existing.
- US-002 must verify the launch-domain subset of the dictionary actually preserves all three properties (see §5).

---

## 5. Recorded blocker — `docs/schema/` is absent

CLAUDE.md's read order and this session's premise ("schema dictates the stack") both point at `docs/schema/` as the 103-table dictionary and DDL. **It is not present in this repo.** The stack is confirmable from the decision ledger and build plan — the dictionary's Postgres shape is attested by both docs — but:

- **US-002 cannot be written without it.** "Migrate domains 01, 07, 09" is unexecutable until the dictionary defines which tables those domains contain and their DDL.
- The D8 verification ("verify the launch-domain subset preserves line structure") is likewise blocked on it.

**Action:** the operator drops `docs/schema/` into the repo before the EP-00 session (queue #2). Nothing else in this ADR is contingent on it.

## 6. Open items (unchanged by this ADR)

- **ADR-2** — enrichment launch vs. fast-follow. Stays open. US-005c builds the enrichment service behind an interface plus a fixture implementation regardless of the outcome, so no launch story blocks on it.
- **1build licensing** (US-013) — parked. `CostProvider` interface + `FixtureCostProvider` (US-009) is the seam; `OneBuildCostProvider` lands whenever terms do.
- **US-026 decline path** — parked until behavior is defined.

## 7. Consequences

- EP-00 (queue #2) proceeds against this stack with no open architecture questions, gated only on §5.
- The three ratified decisions are now **invariants checked on every story**, alongside SESSION-CONTEXT §4. A story that violates D1, D7, or D8 is rejected at review, not patched after.
