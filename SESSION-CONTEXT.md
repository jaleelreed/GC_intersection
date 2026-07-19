# SESSION CONTEXT — GC_intersection
**Drop this + build-plan.md + the story file into any Claude Code session. This file is the decision ledger; the build plan is the spec. Where they conflict, this file wins (it is newer, 2026-07-18).**

---

## 1. What we are building (one paragraph)

Zero-setup estimating for standalone SMB residential-renovation GCs running on no construction software. A homeowner fills a hosted intake form (embedded on the GC's site AND shareable as a direct link/QR); the platform creates a project and a priced draft estimate seeded from county market data; the GC edits to their real pricing; every edit is captured as a benchmark_observation; the next draft starts closer. **The convergence loop is the company.** Build the whole machine end-to-end against fixture data; the engine gets refined live, by GC edits, after the build.

**Stack:** Next.js / Neon PostgreSQL 16 / pgvector. Schema: 103-table dictionary; migrate domains 01, 07, 09 only at launch.

---

## 2. Decision ledger (supersedes anything contrary in older docs)

| # | Decision | Consequence |
|---|---|---|
| D1 | **Estimate classes**: concept (form-derived, range) → plan-derived (graph) → contracted. **Hard gate: concept estimates NEVER convert to budget/SOV.** | Provenance field for estimate class on every estimate. Concept output is a range with named swing drivers, not a point. |
| D2 | **Feasibility-enriched intake**: existing-conditions block (year built, occupied/vacant, access), scope-class per toggle (in-place / reconfigure / relocate), structural flags, finish tier. Address-based public-data enrichment (assessor, permits, historic GIS) pre-fills conditions. | US-005/006 contracts expand. Enrichment launch-vs-fast-follow = **ADR-2, still open** — build the enrichment service behind an interface either way. |
| D3 | **Assemblies take modifiers**: scope-class, condition, and tier multipliers layered on the county seed. Unknown answers widen the range; never default silently. | US-010/011 expand. Modifier table in schema. |
| D4 | **Narrative field on intake**: structured fields set price; free-text narrative sets context only. Narrative runs through extraction (`ai_jobs` row, `verified_by` pending) → scope hints + risk flags shown to the GC as suggestions. **Narrative never silently prices anything.** | US-005 gains field + extraction job; US-008 notification carries hints alongside the number. |
| D5 | **Dual-door intake**: one hosted form, two presentations — embed (iframe/script on GC site) and direct link (text/email/QR, works for GCs with no website). `channel` attribution on every submission, per GC. | US-005 = "hosted intake form with embed + link presentation, channel attribution." Two skins, one component set. |
| D6 | **Payments are OUT.** No deposit collection, no rails, no money movement. EP-05 acceptance is a state change only. | Keep bid/acceptance events as first-class timestamped schema objects with clean state machines (good design, not payments scaffolding). |
| D7 | **Immutable accepted-bid snapshot**: acceptance freezes an estimate version nothing can mutate. | Required in EP-05. This is "original scope" for any future downstream audit. Cheap now, unfixable retroactively. |
| D8 | **Estimate lines must be structurally convertible** (future budget/SOV/sub-scope conversion): every line carries cost-code/trade classification, unit basis (qty × unit × unit-price, not lump text+price), and stable line identity across versions. | Verify the launch-domain subset preserves this. Flattened lines are a build error. |
| D9 | **§7 retrospective test is a calibration input, not a gate.** Build proceeds end-to-end against fixtures. Run the 5-job comparison when GC data arrives; feed results into fixture/seed tuning. | Nothing blocks on it. |
| D10 | **Launch sequence**: full build → soft-launch with 2–3 friendly DC-area GCs as the calibration phase (their edits tune the engine) → wide distribution once trust floor is met. | Trust-floor instrumentation required: US-022 convergence metric + **edit coverage** (% of lines touched per draft). Target before wide launch: new drafts need edits on <⅓ of lines for a friendly's job types. |
| D11 | **Downstream back-end (budget/SOV/CO/pay-app tables, audit engines) is deferred** to the intersection roadmap. Do not build Group-1-shaped features. | D7 + D8 keep the door unlocked. A conversion-mapping doc is queued separately; not a build task. |
| D12 | **Distribution-ready surfaces**: intake embeddable in one script tag; concept estimate shareable as a link; bid PDF carries product fingerprint; hosted link page shows GC name/logo on platform chrome. | Homeowner-as-channel is the GTM; these are cheap now and load-bearing later. |

**Parked (do not mark ready):** US-013 (1build licensing — build against `FixtureCostProvider` behind the `CostProvider` interface), US-026 (decline path undefined), ADR-2 (enrichment timing).

---

## 3. Build order

```
EP-00 skeleton → EP-01 intake → EP-02 seed → EP-03 edit+send → EP-04 capture/converge → EP-05 accept
```
Value order = dependency order. EP-05 may parallel EP-04 if file surfaces don't collide. ~28 stories total after the D2/D4/D5 expansions.

## 4. Non-negotiable invariants (check on every story)

1. **Deterministic**: same input → same output; every number traceable to its source (seed, modifier, observation, or GC edit).
2. **Provenance everywhere**: every derived object points at its source (`source_observation_id` pattern). Every AI-produced artifact gets an `ai_jobs` row + `verified_by`.
3. **Versioned, never destructive**: estimates version per the SOV-line pattern; accepted versions are immutable (D7).
4. **Structured sets price; narrative sets context** (D4).
5. **RLS on all migrated tables**; fixed test account; seed + reset in one command.

## 5. The build loop, per story

`/build US-00N` → restate contract → plan → push back once → tests first → verify (run tests + build) → commit with story ID → PR with evidence → `reviewer` agent → handoff → next.

Session queue: B2 architecture (`spec-architecture` — confirm stack + ADR; ratify D1, D7, D8) → EP-00 (`spec-skeleton`) → D contracts (`spec-contracts`, US-005..013 — **blocked on ADR-2**) → E design (`spec-design`, five states per screen; hero moments: intake form, the reveal, the editor; both form skins from one component set) → G build, one story per session.

## 5b. Amendments (append-only)

- **2026-07-18 — ADR-2 RESOLVED: fast-follow** (operator decision). Enrichment interface +
  fixture implementation build at launch; live assessor/permit/GIS integrations land after
  soft launch. See `docs/adr/ADR-002-enrichment-timing.md`. The D-contracts session is
  unblocked; §2's "ADR-2, still open" and the parked-list entry "US-005c full enrichment"
  are superseded by this line.

- **2026-07-19 — US-026 decline path DEFINED** (Gap 7; unparks the decline story).
  A buyer may decline a proposal they've received or viewed: it records the state + an
  optional reason, notifies the GC in-platform, and moves the lead's pipeline stage to
  `lost`. Terminal, collects no payment (D6). Supersedes the "decline behavior undefined"
  parking in §2 and build-plan-v2 §5.

## 6. What this session should do

State which session you are (B2 / skeleton / contracts / design / build US-00N). If unstated, assume the next unstarted item in the queue above. Restate the relevant contract from build-plan.md as amended by §2 of this file, then proceed per the loop.
