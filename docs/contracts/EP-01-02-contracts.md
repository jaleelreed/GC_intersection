# D Contracts — EP-01 (intake) + EP-02 (seed) · US-005..013

**Session:** D contracts (`spec-contracts`, queue #3) · 2026-07-18
**Unblocked by:** ADR-002 (enrichment = fast-follow)
**Sources:** build-plan-v2 §4 as amended by SESSION-CONTEXT §2 · the migrated schema
(`docs/schema/`, live on Neon) · ADR-001/002. **Where a contract names a column or enum, the
schema is the authority** — these contracts cite it, they do not restate it.

Every number in §US-010/011 marked **[seed]** is an authored calibration input, not a
finding (D9): it ships as *data* (`assembly_modifiers`, `scope_assembly_map` platform rows),
GC edits tune it, and no engine hardcodes it.

---

## US-005 — Hosted intake form (two presentations, one component set)

**Contract.** A homeowner reaches ONE form component via either presentation of an
`intake_links` row and submits; the submission lands as `intake_submissions` with `channel`
snapshotted. No homeowner account. Works on a phone.

- **Routes.**
  - Direct link: `GET /i/[slug]` — standalone page, platform chrome showing
    `intake_links.display_name` + logo (D12). QR encodes this URL.
  - Embed: `GET /i/[slug]/embed` — same component, minimal chrome, iframe-safe
    (no frame-ancestors block for this route only). Script tag (D12):
    `<script src="https://gc-intersection.vercel.app/embed.js" data-slug="{slug}"></script>`
    → injects the iframe, auto-height.
  - Submit: `POST /api/intake/[slug]` — validates, writes `intake_submissions`, fires US-007.
- **Channel attribution.** `channel` copied from `intake_links.channel` at submit time
  (embed | link | qr). A GC may hold many links; `slug` is the public key, unguessable
  (nanoid ≥ 10 chars). Inactive/deleted link → 404, form never renders.
- **Form fields (structured payload — these price; schema `intake_submissions`):**
  - Contact: `contact_name`, `contact_email` (required), `contact_phone` (optional).
  - Address: `address_line1` (req), `address_line2`, `city` (req), `state` (req, 2-letter),
    `postal_code` (req). `county_fips` derived server-side (US-005c fixture geo-lookup);
    unknown county → submission accepted, `county_fips` NULL, range widens (US-011).
  - `square_footage` (required — the one denominator assemblies cannot proceed without;
    "approximate is fine" in UI copy).
  - `existing_config` / `target_config` (jsonb): `{beds, full_baths, half_baths}` integers.
  - Conditions (D2): `conditions` jsonb = `{year_built: int|null, occupied: bool|null,
    access: 'easy'|'moderate'|'difficult'|null, known_problems: string[]}` — known_problems
    from fixed list: `water_damage · foundation_cracks · knob_tube_wiring · galvanized_plumbing
    · asbestos_suspected · roof_leak · pest_damage · none`. Every conditions field is
    skippable; skipped = NULL = range widens (D3). **No silent defaults.**
  - Scope toggles + structural flags + finish tier: see US-006.
  - `narrative` (free text, optional, 2000 chars): "describe what you're hoping to do."
- **Validation.** Server-side zod schema mirrors the above; reject → 422 with per-field
  errors; nothing writes on reject. Honeypot field + submit-time floor (<3s = `spam`).
- **Non-goals.** Email delivery, buyer accounts, file upload, enrichment UI.
- **Tests.** Route renders both presentations from one component (snapshot of shared ids);
  submit happy-path writes row with correct `channel`/`org_id`; 422 paths; inactive slug 404;
  spam floor; RLS: submission invisible to another org.

## US-005b — Narrative extraction (suggestions, never price)

**Contract.** On submission with non-empty `narrative`, create `ai_jobs` row
(`job_type='summarize'`, status `queued`) and produce `intake_scope_hints` rows
(`kind` = scope_hint | risk_flag, with `source_excerpt`, `ai_confidence`), `verified_by`
NULL until a GC user acts. Launch implementation is **deterministic keyword fixture**
(no LLM call, no key): a rules table maps phrases → hints (e.g. "mold/moisture/damp" →
risk_flag "Moisture mentioned — possible remediation scope"). The `ai_jobs` +
`verified_by` plumbing is identical whichever engine fills it later.
- **Hard rule (D4):** no code path from `intake_scope_hints` or `narrative` into
  `estimate_lines`, modifiers, or totals. Enforced by test: submission with narrative
  "gut the kitchen, gold faucets" prices identically to the same structured payload
  with empty narrative.
- **Tests.** Hints created with ai_job + excerpt; empty narrative → no job; the
  identical-pricing test above; hint dismiss/verify updates `dismissed_at`/`verified_by`.

## US-005c — Enrichment behind an interface (ADR-002: fixture only at launch)

**Contract.** `EnrichmentProvider` interface: `enrich(address) → EnrichmentResult
{provider, raw_payload, extracted: {year_built?, gsf?, stories?, historic_district?,
permit_history?[]}}`, persisted as `enrichment_snapshots`, referenced by
`intake_submissions.enrichment_snapshot_id`. Launch ships `FixtureEnrichmentProvider`
(deterministic: known fixture addresses → canned payloads; unknown → empty result) plus
the county geo-lookup (zip→county_fips over the `counties` table, seeded with the
DC-area six: 11001 DC · 24031 Montgomery · 24033 Prince George's · 51013 Arlington ·
51059 Fairfax · 51510 Alexandria). Empty enrichment is the **normal** production state,
not an error. Live `DcAssessorProvider` etc. are post-soft-launch stories.
- **Tests.** Fixture round-trip persists snapshot + provenance; unknown address → empty
  extract, submission proceeds; county derivation for all six FIPS + unknown-zip NULL.

## US-006 — Scope toggles with scope class, structural flags, finish tier

**Contract.** `scope_toggles` jsonb: exactly ten keys — `bath · kitchen · floors · walls ·
utilities · plumbing · electric · mechanical · roof · basement` — each
`{on: bool, class: scope_class|null}` where `scope_class` ∈ in_place | reconfigure |
relocate (schema enum). Toggle on with class null = **unknown class** → widens (D3), never
defaults. `structural_flags` jsonb: `{walls_removed, addition, foundation_work,
roof_structure}` booleans, null = unknown. `finish_tier` ∈ economy | mid | custom, nullable
(null widens). UI: class chips appear only when a toggle is on; copy in homeowner language
("keep layout" / "move things around" / "relocate to a different spot").
- **Tests.** Payload shape validation (unknown key rejected); class-null accepted and
  distinguishable from off; round-trip into US-010's assembly selection.

## US-007 — Submission auto-creates project (no human)

**Contract.** In one transaction after intake validation: create `projects` row
(`org_id` from link; `code` = `INT-{YYYY}-{seq per org}`; `name` = "{address_line1} —
{primary toggles}"; `sector='residential'`; address/county copied; `stage='pursuit'`),
create the draft estimate (US-011), then update the submission: `status='converted'`,
`project_id`, `estimate_id` set. Idempotent per submission id. Failure anywhere rolls back
everything; submission stays `submitted` and is retryable.
- **Tests.** Happy path produces project + estimate + updated submission atomically;
  org-scoped code sequence; replay is a no-op; injected failure post-project rolls back.

## US-008 — In-platform notification

**Contract.** On conversion, one `notifications` row per active `owner_admin` +
`project_manager` membership of the org: `kind='intake_received'`,
`subject_table='intake_submissions'`, `subject_id`, `title` = "New lead: {address_line1}",
`body` = one line with range + top swing drivers count + hints count. Opening marks
`read_at`. The screen shows: the range (never a point), named swing drivers, unpriced
hints (US-005b) visually separated from priced lines, and Invariant "decision-support"
framing (range is a draft seeded from county data — the GC's edit is the price).
- **Tests.** Fan-out to the right roles only; read-marking; body contains range text.

## US-009 — CostProvider interface + FixtureCostProvider

**Contract.** `CostProvider.getCosts(county_fips, cost_code_ids?) → MarketCostRow[]`
(shape = `market_cost_items` columns). `FixtureCostProvider` queries
`market_cost_items WHERE source='fixture'` for the county, falling back
county → msa → national-default row set if county rows are absent (fallback is *named*
in provenance so US-011 can widen for it). Fixture dataset: **real ugly data** —
seeded per the six DC-area counties for every cost_code the ten assemblies reference
(~40–60 rows/county), authored in `db/fixtures/market-costs.sql`, loaded by `db:seed`.
`OneBuildCostProvider` (US-013) implements the same interface later; **no caller may
know which provider answered** beyond provenance metadata.
- **Tests.** Interface conformance suite runs against the fixture impl (later reused for
  1build); county fallback chain + provenance; determinism (same inputs → same rows).

## US-010 — Assemblies: toggles × class × sqft → lines, modifiers layered

**Contract.** Selection: for each on-toggle, `scope_assembly_map` rows (platform seed,
org override per schema priority rule) fire assemblies with `param_bindings` evaluated
against the submission (e.g. `{"area_sf": "submission.square_footage * 0.15"}` for bath).
Expansion: `assembly_components.quantity_formula` × market unit costs (US-009) →
`estimate_lines` each carrying `cost_code_id` (required — concept lines never null),
`cost_kind`, qty/uom/unit_cost/total, `assembly_id`, `market_cost_item_id`,
`seed_source='market_seed'`, fresh `lineage_id` (D8/US-012b).
**Modifier layering (D3), deterministic order:** base line total × scope-class multiplier
× condition multipliers × tier multiplier, each application recorded in the generation
trace. **[seed] platform `assembly_modifiers` rows:**
- scope_class: in_place ×1.00 +0% · reconfigure ×1.25 +8% · relocate ×1.45 +12%
- condition: year_built<1940 ×1.15 +8% · 1940–77 ×1.08 +4% · occupied ×1.08 +3% ·
  access=difficult ×1.10 +4% · each known_problem ×1.00 **+5% widen only** (a flag is a
  question, not a price)
- finish_tier: economy ×0.85 +0% · mid ×1.00 +0% · custom ×1.35 +10%
Unknown dimension → multiplier 1.00 and its **widen contributes to the range** (US-011)
— the number never silently moves, the band honestly grows.
- **Tests.** Toggle→assembly selection incl. org override; formula evaluation (no eval();
  a tiny arithmetic-only parser over `submission.*` names); multiplier order and trace;
  unknown-class widening; golden run: fixed submission → exact line set, byte-stable.

## US-011 — Draft estimate on creation: versioned, range with named drivers

**Contract.** US-007 creates `estimates` (`class='concept'` — D1 gate lives here: no code
path accepts a concept estimate where budget/SOV input is expected) + `estimate_versions`
v1 + lines (US-010) + org default markups (`markup_templates`). **Range math:**
`point = grand_total` (all multipliers applied); `widen_total_pct = base_uncertainty
**[seed] 12%** + Σ range_widen_pct` of every applied-or-unknown dimension (incl. **+6%**
if county fell back to MSA/national, **+4%** if sqft flagged approximate);
`range_low = point × (1 − widen_total_pct)`, `range_high = point × (1 + widen_total_pct)`,
both stored on the version. `swing_drivers` jsonb = every contributor
`{driver, widen_amount_pct, source}` sorted desc; UI names the top 3. Every generation
writes `estimate_generation_runs` (inputs snapshot, assemblies fired, modifiers applied,
precedence log, unknowns → determinism as data); **re-running a trace's inputs must
reproduce the version to the cent** (test).
- **Tests.** Version + range + drivers persisted; determinism replay; unknowns widen and
  are named; concept-class gate (attempted conversion path throws); D7 trigger untouched.

## US-012 / US-012b — Per-line provenance + line-structure invariant

**Contract.** `seed_source` ∈ market_seed | learned | gc_edit on every line; UI badge
"market" vs "learned from your jobs" (US-021 flips precedence later). Structure invariant
(D8) enforced by a **shared runtime assertion + test helper** `assertConvertibleLine`:
cost_code_id present, uom valid, total = round(qty × unit_cost, 2), lineage_id present;
any creation path (US-010 now, editor later) runs it. Version-to-version: unchanged-line
copy preserves `lineage_id`; a genuinely new line gets a new one; **no path ever writes a
text+price-only line** — the helper throws, CI catches.
- **Tests.** Helper rejects each malformed shape; US-010 output passes wholesale;
  lineage stability across a simulated re-version.

## US-013 — OneBuildCostProvider — **PARKED (unchanged)**

Contract exists only as: implements `CostProvider`, populates
`market_cost_items.source='onebuild'`. Blocked on licensing; the interface-conformance
suite from US-009 is its acceptance test when it lands. Do not build.

---

## Cross-cutting acceptance (every story above)

1. RLS respected (fixture second org sees nothing) — tests use both seeded orgs.
2. Money `numeric` end-to-end; no float arithmetic in JS (integer cents or decimal lib).
3. Every derived row carries its provenance FK (invariant §4.2).
4. `npm test` green locally without DATABASE_URL (db-touching tests skip) and green in CI
   with the container; db-migrate workflow keeps Neon current.
5. The seed fixture account gains: one `intake_links` row per channel, the counties six,
   platform `assembly_modifiers` + `scope_assembly_map` rows, market fixture costs —
   extending `scripts/db/seed.mjs` (idempotent).
