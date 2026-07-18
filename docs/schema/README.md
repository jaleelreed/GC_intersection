# docs/schema/ — GC_intersection

## Files, in migration order

| File | What it is |
|---|---|
| `00-launch-subset.sql` | Extracted from Platform Data Model v1.0 (validated 2026-07-15): header, extensions, ALL enums, domain 01 (platform core), `cost_codes` (pulled from domain 03), domain 07 (estimating — takeoff tables excluded), domain 09 + platform infrastructure (touch triggers, RLS DO block, indexes, UOM seed). 25 tables, FK-closed. |
| `10-residential-intake.sql` | New domain 10 (GC_intersection front door): intake links/submissions, enrichment snapshots, scope hints, market seed, assembly modifiers, proposals/tokens/events, notifications — plus decision-ledger amendments to 01/07/09. 10 new tables. Runs after 00. |
| `11-generation-and-delivery.sql` | New domain 11: scope→assembly wiring, counties reference, estimate generation trace (determinism as data), org markup templates + service areas, outbound email delivery. 6 new tables. Runs after 10. |
| `99-platform-full-reference.sql` | The full 103-table Construction OS model, unmodified. **Reference only — never migrate.** Domains 02–06 and 08 are Construction OS scope (D11: deferred). |

## Prunes applied in 00-launch-subset.sql (vs. the full model)
- **Takeoff tables excluded** (`takeoffs`, `takeoff_measurements`): plan ingest is a build-plan non-goal; `estimate_lines.takeoff_measurement_id` kept as a bare uuid column, FK deferred.
- **`budget_lines` ALTER stripped** (domain 03 not migrated). The estimate→budget handoff FK returns with the downstream build (D11).
- **Indexes on excluded tables removed** (commitments, waivers, RFIs, etc.).
- All enums retained even where their domains aren't migrated — harmless, and forward-compatible.

## D8 lint findings (estimate-line convertibility)
Checked `estimate_lines` in the validated model against SESSION-CONTEXT D8:
- ✅ Cost-code classification: `cost_code_id` + `cost_kind` present (nullable — contracts should require it on concept lines).
- ✅ Unit basis: `quantity` / `uom` / `unit_cost` / `total` — no flattened text+price lines possible.
- ❌ **Stable line identity across versions: MISSING.** Lines belong to a version with no lineage between versions. Fixed in `10-residential-intake.sql` via `lineage_id` — required by US-019 (edit→observation) and US-022 (edit distance / edit coverage).
- ✅ D7 support: `estimate_versions.locked_at` exists; domain 10 adds a guard trigger making locked versions immutable at the DB layer.

## Ordering note
The platform's touch-trigger and RLS `DO` blocks iterate `information_schema`, so domain 10 tables are covered only if those blocks execute after 10 — either order migrations accordingly or re-run the two DO blocks as the final migration step.
