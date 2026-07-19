# GC Experience — journeys, features, capabilities

The complete experience a standalone SMB residential-renovation GC needs on the platform,
mapped against what exists today. This is the scope-and-gap source of truth for the GC door.

**Status:** ✅ built · 🟡 partial (engine or data exists, no usable surface) · ⬜ not built ·
⛔ out of scope by decision (do not build)

Grounded in `SESSION-CONTEXT.md` (decision ledger) and `build-plan-v2.md`. As of the
23-PR build: the core loop runs end to end and is live.

---

## Part 1 — The GC's journeys (what they actually do)

### J1 · First run & onboarding
The GC arrives, and in minutes has a working, shareable estimating machine — no library to
build, no data to upload (X-1).

- ✅ Passwordless sign-in (email one-time code)
- ✅ Auto-provisioned workspace on first sign-in (org, membership, intake link, a full clone
  of the starter estimating config so their first draft prices)
- ✅ A usable, shareable intake link with copy / open-form / QR
- 🟡 Company profile — business name is derived from email; **no logo upload, no branding
  control** for the hosted form/bid (D12 wants GC name+logo on the hosted page)
- ⬜ A guided "here's how this works" first-run moment beyond the 3-step blurb
- ⬜ Set service area (which counties they cover) — table exists (`org_service_areas`), no UI

### J2 · Get leads (distribution — the GC's binding constraint)
Winning the lead is the whole game for a private GC; the platform is their top-of-funnel.

- ✅ Direct link (text/QR) and website **embed** (script tag) — two skins, one form
- ✅ Channel attribution captured on every submission (embed / link / qr)
- 🟡 **Embed snippet UI** — `embed.js` works, but there's no screen that hands the GC the
  `<script>` tag to paste on their site
- 🟡 **Multiple / per-campaign links** — schema supports many links per org; no UI to create,
  name, or manage them ("Spring yard signs" vs "Website")
- ⬜ **Channel analytics** — which door produces leads/wins (attribution is stored, never shown)
- ⬜ QR download / printable yard-sign asset

### J3 · Work a lead → win it
A lead lands priced; the GC corrects it to their reality and sends a bid.

- ✅ In-platform notification + Leads inbox
- ✅ The reveal: range, named swing drivers, scope, quarantined narrative hints
- ✅ Estimate editor: edit qty/unit, live exact range, provenance badges, save → new version
- 🟡 Editor is **edit-only** — ⬜ add a line, ⬜ delete a line, ⬜ reorder, ⬜ manage markups
  (US-015 markups are seeded, not editable in the UI)
- ⬜ Bid customization — cover note, inclusions/exclusions, terms, expiry the GC sets
- ⬜ **Coverage check** — homeowner named 3 baths, values cover 2 → name the gap (F-4.6)
- ✅ Send the bid → hashed-token buyer link
- ✅ Printable, fingerprinted bid document (Save as PDF)
- 🟡 **Delivery** — GC copies the link by hand; ⬜ platform email delivery
  (`outbound_messages` table exists, unwired)
- ✅ Buyer views & accepts → estimate version freezes (D7)
- ⬜ **Decline path** (US-026 parked — behavior undefined; engine refuses the transition)
- ⬜ Proposal management — list of sent bids, viewed/accepted status at a glance, resend,
  withdraw, expire, nudge

### J4 · The compounding loop (why they stay)
Bid #2 starts closer than bid #1 — the product's actual moat.

- ✅ Every price edit → `benchmark_observation` (keyed to feasibility dimensions)
- ✅ Harvested into the org's private cost library
- ✅ Next draft prices from the GC's own numbers (learned beats market), recorded in the trace
- 🟡 **Convergence visibility** — `editMetrics` (edit distance + coverage) exists; ⬜ no
  dashboard telling the GC "your drafts are 70% yours now" (the trust-floor signal, D10)
- 🟡 **Pricing library review** — learned costs are applied silently; the flywheel doctrine
  (§17) is *propose, operator confirms* → ⬜ a "review learned rates / accept-reject" surface
  (`RateSuggestion` pattern) is not built

### J5 · Run the business (day-to-day & settings)
- ⬜ **Lead pipeline** — leads are raw notifications today. No status workflow
  (new → contacted → quoted → won/lost), notes, follow-up, or filtering. `intake_submissions`
  has submitted/converted/spam/discarded only.
- ⬜ **Team** — roles exist in schema (`owner_admin`, `project_manager`, `field`…); no invite
  flow or multi-user management
- ⬜ **Settings** — markup templates, finish-tier defaults, service areas, business info
- ⬜ **Account** — change email, session management, delete workspace
- ⬜ Notifications beyond the in-app inbox — ⬜ email / ⬜ push for new lead, viewed, accepted

---

## Part 2 — Capabilities by area (status roll-up)

| Area | Built | Missing |
|---|---|---|
| **Auth & onboarding** | passwordless OTP, auto-provisioned workspace, nav, sign out | logo/branding, service-area setup, first-run guidance |
| **Distribution** | link + embed + QR, channel captured, share card | embed-snippet UI, multi-link management, channel analytics, print assets |
| **Intake** | 2 skins, conditions/scope/finish, narrative, spam floor, enrichment (fixture), county derivation | live enrichment (fast-follow, ADR-002) |
| **Estimating** | priced concept draft, range + swing drivers, modifiers, determinism trace | live-data confidence, alternates/allowances UI |
| **Editor** | edit qty/unit, live range, provenance, versioned | add/delete/reorder lines, markup management, bid customization, coverage check |
| **Flywheel** | observation capture, harvest, learned-beats-market | convergence dashboard, learned-rate review/confirm (RateSuggestion) |
| **Bids/proposals** | send, buyer view, accept, D7 freeze, PDF | email delivery, proposal list/status, resend/withdraw/expire, decline path |
| **Leads/CRM** | inbox, reveal, spam handling | pipeline statuses, notes, follow-up, filter/search |
| **Team/settings** | 5-role schema | invites, settings screens, account management |
| **Notifications** | in-app inbox | email, push |

---

## Part 3 — Deliberately OUT of scope (guardrails — do not build)

- ⛔ **Payments / deposits / money movement** (D6). Acceptance is a state change only.
- ⛔ **Budget / SOV / change orders / pay-apps** (D11). Concept estimates **never** convert to
  budget/SOV — hard gate (D1). D7 + D8 keep the door unlocked for a *future* class, not now.
- ⛔ **Cross-org cost pooling / network benchmark** on the GC door — cost data never pools
  (X-2); benchmark is a different door and needs k≥5.
- ⛔ **Multi-jurisdiction rule authoring, DSLs, plugin loaders** — internal shape only.

Anything that serves the owner/lender at the GC's expense is a business-model error (X-7):
the GC is the payer; every feature serves them.

---

## Part 3b — Gap backlog: CLOSED (2026-07-19)

All eight backlog items from Part 4 shipped, each as a tested, CI-green PR:

1. ✅ **Email delivery** — provider-gated (Resend when keyed; queued + link otherwise), `outbound_messages` record.
2. ✅ **Lead pipeline** — stage (new/contacted/quoted/won/lost) + notes; Leads page is a filterable pipeline.
3. ✅ **Editor completeness** — add / delete lines + markup rate editing (reorder deferred).
4. ✅ **Distribution** — `/app/links`: create/name links per channel, per-link share URL + QR + embed snippet, channel analytics.
5. ✅ **Convergence dashboard** — `/app/insights`: edit-coverage, learned-rate count, transparent learned-price list.
6. ✅ **Branding + settings** — `/app/settings`: business name (→ hosted form + bid), service areas, markup defaults. *(Logo binary upload still deferred — needs blob storage.)*
7. ✅ **Proposal management + decline** — `/app/bids`: status list, resend, withdraw; **US-026 decline path defined** (reason, GC notified, lead → lost).
8. ✅ **Team + account** — `/app/team`: invite by email (sign-in-to-join, no email send), remove members; account summary.

**Remaining deferrals:** live email requires a `RESEND_API_KEY` + verified sender; logo upload needs blob storage; line reorder in the editor. None block the day-to-day GC workflow.

## Part 4 — Suggested order for the gaps (highest leverage first)

1. **Email delivery of the bid** (J3) — the send flow is half-built; copy-paste is the weakest
   link in the money path. `outbound_messages` is waiting.
2. **Lead pipeline** (J5) — statuses + notes + follow-up turn a notification list into a CRM the
   GC runs their week from. Highest daily-use surface.
3. **Editor completeness** (J3) — add/delete lines + markup management; today they can only
   nudge existing lines.
4. **Embed-snippet + multi-link + channel analytics** (J2) — close the distribution loop and
   show which door works.
5. **Convergence dashboard + learned-rate review** (J4) — make the moat visible and honor the
   "operator confirms" doctrine; also the D10 launch gate.
6. **Company branding** (J1) — logo/name on the hosted form and bid (D12 distribution surface).
7. **Proposal management + decline path** (J3) — bid tracking; resolve US-026.
8. **Settings / team / account** (J5) — table stakes for a multi-person shop.
