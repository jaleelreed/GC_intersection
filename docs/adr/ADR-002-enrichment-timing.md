# ADR-002 — Address enrichment ships as a fast-follow, not at launch

**Date:** 2026-07-18
**Status:** Accepted (operator decision, closing the "ADR-2" open item from SESSION-CONTEXT D2)

## Decision

Address-based public-data enrichment (assessor records, permit history, historic-district
GIS pre-filling the intake form's existing-conditions block) is a **fast-follow after soft
launch**, not a launch requirement.

At launch:
- The intake form prices from the homeowner's structured answers alone. Unanswered
  conditions widen the concept range per D3 — they never default silently.
- **US-005c builds the interface and a fixture implementation anyway** (as D2 always
  required): `EnrichmentProvider` with a `FixtureEnrichmentProvider`, mirroring the
  `CostProvider` / `FixtureCostProvider` seam (US-009). `enrichment_snapshots` (schema
  domain 10) is populated by the fixture path in dev/test and stays empty in production
  until the live provider lands.
- Live integrations (DC assessor, permit records, historic GIS) land post-soft-launch as
  additional `EnrichmentProvider` implementations, with no contract change upstream.

## Why

- Zero-setup launch does not depend on enrichment: the range logic already absorbs
  unknowns honestly, and the 2–3 friendly DC-area GCs (D10) can calibrate without it.
- Live public-data sources add external dependencies, scraping/API accounts, and
  failure modes to the critical path — the classic way a launch date slips on a feature
  the trust floor doesn't need.
- The seam makes the timing decision cheap to hold and cheap to reverse; the schema
  (`enrichment_snapshots`, provenance on `intake_submissions`) already accommodates it.

## Consequences

- The D-contracts session (US-005..013) is **unblocked**: US-005c's contract is the
  interface + fixture implementation only.
- The intake screen designs must treat "no enrichment" as the **normal** state, not a
  degraded one (E-design session note).
- US-026 (decline path) and US-013 (1build licensing) remain the only parked stories.
