# Build Plan v2 — GC_intersection
**Supersedes build-plan.md (2026-07-17). Amended per SESSION-CONTEXT.md decision ledger | 2026-07-18**
**Stack:** Next.js / Neon PostgreSQL 16 / pgvector · schema: 103 tables, migrate ~15–20 at launch (domains 01, 07, 09)

The single reference for what gets built and in what order. Point a Claude Code session at this plus SESSION-CONTEXT.md.

---

## 1. What this product is

A hosted intake form — embedded on a GC's website AND shareable as a direct link/QR — produces a priced draft estimate: seeded from county-level market cost data, shaped by feasibility signals, with no setup, no library to populate, no archive to upload. The GC edits the draft to their real pricing; every edit is captured; the next draft starts closer. The buyer is a standalone SMB residential-renovation GC running on no construction software.

**The differentiator is zero-setup: value on the first bid, before any data exists.** The company is the convergence loop — bid #2 measurably closer than bid #1. Absent that, it is a form with a price list.

This product is the front door of a larger intersection roadmap (see intersection-roadmap.md). It ships **concept estimates** (form-derived, presented as a range with named swing drivers). Plan-derived and contracted estimate classes come later. **Hard gate: concept estimates never convert to budget/SOV.**

## 2. The end-to-end flow

```
1.  Homeowner opens intake form (via GC-site embed OR direct link/QR; channel attributed)
2.  Address entered → enrichment pre-fills conditions (assessor, permits, historic GIS)*
3.  Homeowner completes structured scope + conditions + finish tier, then free-text narrative
4.  Platform creates project + draft estimate                       [no human]
5.  Draft prices from county market data via assemblies + modifiers  [no human]
    → output is a RANGE with named swing drivers; unknowns widen it
6.  Narrative extraction produces scope hints + risk flags           [ai_jobs + verified_by]
7.  GC opens notification: sees the range, the drivers, the hints
8.  GC edits lines to their real pricing
9.  Every edit writes a benchmark_observation                        [no human]
10. GC sends bid from the platform
11. Buyer accepts; acceptance freezes an immutable estimate snapshot
12. Next draft seeds from cost_items harvested from observations
```

Steps 4, 5, 9, 12 are the product. **Step 12 is the company.** (*Step 2 gated on ADR-2.)

**Invariant: structured fields set price; narrative sets context.** The narrative never silently prices anything.

## 3. Build order

```
EP-00 ──> EP-01 ──> EP-02 ──> EP-03 ──> EP-04 ──> EP-05 ──> soft launch
skeleton  intake    seed      edit+send capture   accept    (calibration)
                    │
                    └── 1build licensing lands here.
                        Build against FixtureCostProvider until it does.
```

Value order and dependency order agree. EP-05 can run parallel to EP-04 if file surfaces don't collide. The build runs end-to-end against fixtures; the engine is refined live by GC edits post-build (§8).

## 4. Epics and stories

### EP-00 — Walking skeleton
Empty app loads at a URL, CI green, dev DB seeded, reset in one command.
*Non-goals: any feature.*

- **US-001** Repo + Next.js scaffold + branch protection
- **US-002** Neon PG16 + pgvector; migrate domains 01, 07, 09 only; RLS for those tables
- **US-003** CI: tests + build block merge on failure; preview deploy per branch
- **US-004** Seed + reset scripts for the fixed test account; smoke test asserts 200

### EP-01 — Intake → project
A homeowner submits the form and a project appears in the GC's platform, unassisted.
*Depends: EP-00. Non-goals: email delivery (in-platform notification only); no buyer account yet.*

- **US-005** Hosted intake form, two presentations from one component set: **embed** (script/iframe on GC site, inherits GC visual context) and **direct link** (standalone page, GC name/logo on platform chrome; works for GCs with no website; QR-able). `channel` attribution on every submission, per GC link. Fields: address, existing config, target config, square footage, **existing-conditions block** (year built, occupied/vacant, access, known problems), free-text **narrative** ("describe what you're hoping to do")
- **US-005b** Narrative extraction: `ai_jobs` row per narrative → scope hints + risk flags, `verified_by` pending; surfaced to GC as suggestions only — never priced silently
- **US-005c** Address enrichment service behind an interface (assessor records, permit history, historic-district GIS; pre-fills conditions) — **gated on ADR-2** (launch vs. fast-follow); interface + fixture enrichment built regardless
- **US-006** Scope toggles (bath, kitchen, floors, walls, utilities, plumbing, electric, mechanical, roof, basement) each carrying **scope class** (in-place / reconfigure / relocate), plus structural-intervention flags and **finish tier** (economy / mid / custom) → structured scope payload
- **US-007** Submission auto-creates `project` (with channel + enrichment provenance)
- **US-008** In-platform notification; GC opens it and sees the project, the range, swing drivers, and narrative hints

### EP-02 — The seed
The project carries a priced draft estimate before the GC touches it.
*Depends: EP-01. Blocked by 1build licensing — mitigate with `CostProvider` interface + `FixtureCostProvider`. Non-goals: takeoff canvas; plan ingest (intersection roadmap).*

- **US-009** `CostProvider` interface + `FixtureCostProvider` (real ugly fixture data, county-keyed)
- **US-010** Assemblies: scope toggle + class + square footage → line items, with a **modifier table** (scope-class, condition, and tier multipliers layered on the county seed)
- **US-011** Draft `estimate` generated on project creation, versioned; **range logic** — answer completeness drives band width; unknowns widen the range, never default silently; output names its swing drivers
- **US-012** Per-line provenance: market-seeded vs. learned-from-your-jobs; estimate carries its **class** (concept)
- **US-012b** Line structure invariant: every line carries cost-code/trade classification, unit basis (qty × unit × unit-price), and stable line identity across versions — **no flattened text+price lines** (future-conversion requirement, D8)
- **US-013** `OneBuildCostProvider` — **gated on 1build licensing**

### EP-03 — Edit and send
The GC corrects the draft and sends a bid without leaving the platform.
*Depends: EP-02. Non-goals: material selections, SOV, receipts.*

- **US-014** Estimate editor: line add/edit/delete, versioned per the SOV-line pattern; mobile-first (phone, job site)
- **US-015** Markups, ordered
- **US-016** Bid render → PDF (carries product fingerprint — distribution surface, D12)
- **US-017** Send from platform
- **US-018** Sent-bid state machine (first-class timestamped events)

### EP-04 — Capture and converge  ← the company
The GC's second bid starts closer than their first, with no upload and no library.
*Depends: EP-03. Non-goals: cross-org pooling (k≥5); margin analysis (edits are prices, not costs).*

- **US-019** Every GC edit writes a `benchmark_observation` (per-unit, per-GSF, MSA + construction type, keyed to feasibility dimensions: scope class, conditions, tier)
- **US-020** `cost_items` harvest from observations via `source_observation_id`
- **US-021** Seed precedence: learned `cost_item` beats market seed; learned items feed concept-range calibration
- **US-022** Edit-convergence metric — edit distance, bid N vs bid 1, per GC — **plus edit coverage** (% of lines touched per draft; the trust-floor metric, D10)
- **US-023** `ai_jobs` + `verified_by` on anything AI-extracted

### EP-05 — Acceptance
The buyer accepts and the platform knows.
*Depends: EP-03. Non-goals: contract execution; **payments — explicitly out (D6)**; no deposit collection, no money movement.*

- **US-024** Buyer receives link, views bid
- **US-025** Accept → state returns to platform; **acceptance freezes an immutable estimate-version snapshot** (D7) — first-class timestamped event, clean state machine
- **US-026** Decline path — **behavior undefined; cannot go `ready` until defined**

## 5. Parked — do not mark ready

| Item | Blocked on |
|---|---|
| US-013 | 1build direct licensing terms |
| US-026 | Decline-path behavior definition |
| US-005c full build | ADR-2 (enrichment launch vs. fast-follow) |
| Concept→budget/SOV conversion | Permanently gated until plan-derived class exists (D1) |
| Payments / deposit collection | Deliberately cut (D6); rationale in intersection-roadmap.md |
| Downstream back-end (budget/SOV/CO/pay-app tables, audit engines) | Intersection roadmap (D11); D7 + D8 keep the door unlocked |

Constraints, not validation gates. None block EP-00 through EP-04.

## 6. Session queue

| # | Session | Skill | Note |
|---|---|---|---|
| 1 | B2 architecture | `spec-architecture` | Short — schema dictates the stack. Confirm + ADR. **Ratify D1 (class gate), D7 (immutable snapshot), D8 (line structure).** |
| 2 | EP-00 | `spec-skeleton` | No blockers |
| 3 | D contracts (US-005..013) | `spec-contracts` | Needs real values. **Blocked on ADR-2.** |
| 4 | E design (EP-01/02) | `spec-design` | Five states per screen. Hero moments: intake form (both skins), the reveal, the editor. Contractor-grade, not startup-grade. Empty/degraded states designed honestly (thin county data, enrichment miss, wide range). |
| 5 | G build (US-001..) | `spec-build` | One story per session |

**The build loop, per story:** `/build US-00N` → restate contract → plan → push back once → tests first → verify (run tests + build) → commit with story ID → PR with evidence → `reviewer` agent → handoff → next.

## 7. The retrospective test — calibration input, not a gate (D9)

Take 5 completed jobs from a known GC. Hand-price each draft from county market data. Compare line-by-line to what they actually charged. Additionally: would the concept range have contained the final contract value (anchoring calibration)?

Results tune fixtures and seed strategy. **The build does not wait on this.** Live GC edits are the higher-quality calibration signal (§8).

## 8. Launch sequence (D10)

1. **Full build** — EP-00 → EP-05 against fixtures.
2. **Soft launch / calibration phase** — 2–3 friendly DC-area GCs; framed honestly: the draft starts rough, it learns your pricing. Their edits are the tuning pass.
3. **Trust floor** — wide distribution when new drafts need edits on <⅓ of lines for a friendly's job types (US-022 edit coverage).
4. **Distribution** — homeowner-as-channel: embed for cold traffic, link/QR for the warm channel. Channel attribution (US-005) is the GTM analytics.
