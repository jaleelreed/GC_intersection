# E Design — EP-01/02 screens

**Session:** E design (`spec-design`, queue #4) · 2026-07-18
**Rule of the session:** five states per screen (empty · loading · ideal · degraded ·
error), designed honestly — a wide range is shown as a wide range with its reasons, never
dressed up. Hero moments: **the intake form** (both skins), **the reveal**, **the editor**.

## 1. Design language — contractor-grade, not startup-grade

- **Audience split:** homeowners see the intake form; GCs see everything else — often on a
  phone, outside, gloves-adjacent. Both get: 16px+ base type, 44px+ touch targets, high
  contrast (WCAG AA on all text), one accent color, zero decorative animation.
- **Palette:** neutral slate surfaces; accent `#B45309` (amber-700 — job-site, not SaaS
  blue); success/warn/error use standard semantic hues. GC branding (name/logo from
  `intake_links`) sits on **platform chrome** (D12) — their identity, our frame.
- **Numbers:** tabular numerals everywhere money appears. A **range is one typographic
  object** ("$41k – $58k"), never two numbers that could be read as options.
- **Voice:** homeowner-side is plain English ("move things around" not "reconfigure");
  GC-side uses trade terms. Neither side ever sees jargon from the other's world.
- **The disclaimer posture:** every estimate surface carries one quiet, consistent line —
  "Draft seeded from county market data. Your edit is the price." Decision support,
  never determination.

## 2. Screen: Intake form (homeowner) — HERO

One component set, two skins (US-005/D5):
- **Direct link `/i/[slug]`:** platform chrome, GC name + logo top, trust line
  ("Powered by GC_intersection" — the D12 fingerprint). Card-width column on desktop,
  full-bleed on mobile.
- **Embed `/i/[slug]/embed`:** no chrome, transparent background, inherits the host page's
  visual context; auto-height postMessage to `embed.js`.

**Flow — 4 steps, one screen each on mobile, progress dots, ~3 minutes:**
1. **Address + contact** (name, email, phone-optional). Zip drives county silently.
2. **The scopes** — the ten toggles (US-006) as large tap cards with icons; tapping one
   expands its class chips (keep layout / move things around / relocate) + "not sure"
   (= class null, honest widen). Structural flags as a compact checklist below.
3. **The place** — sqft ("approximate is fine"), beds/baths existing → target steppers,
   conditions block (year built, occupied?, access, known problems checklist). **Every
   field skippable; skip = "we'll price a wider range."** That sentence appears inline
   the first time a field is skipped.
4. **In your words** — the narrative textarea ("describe what you're hoping to do"), then
   submit → confirmation: "Sent to {GC name}. They'll reach out at {email}." No fake
   "calculating your price" theater — the homeowner never sees the number (X-7-adjacent:
   the GC is the customer; the number is theirs to deliver).

**Five states:** *empty* = step 1 fresh (autofocus address) · *loading* = submit spinner
on the button only, form stays visible · *ideal* = confirmation screen · *degraded* =
enrichment absent (ADR-002: this is NORMAL — no banner, nothing missing-looking; unknown
county accepted silently) · *error* = inline 422 field errors; network failure keeps every
answer and offers retry ("nothing was lost").

## 3. Screen: The reveal (GC opens the notification) — HERO

The moment the product proves itself: lead in, priced draft out, zero setup (US-008).

**Layout (mobile-first single column):**
1. **Header:** address + "New lead · {channel} · {time ago}" — channel attribution visible
   from day one (the GC learns which door works).
2. **The range, huge:** "$41,200 – $57,800" + the disclaimer line directly beneath.
3. **Why this range — swing drivers, named (US-011):** top 3 as plain sentences with
   magnitude: "Built before 1940 · +8% uncertainty", "Bath layout change · +8%",
   "Year built not answered · +4%". A "what would narrow this" affordance reframes
   unknowns as questions for the homeowner call — uncertainty converted into an agenda.
4. **Scope summary:** the on-toggles as chips with class labels; structural flags called
   out in warn color.
5. **Hints, visually quarantined (US-005b/D4):** "From their description" section in a
   dashed-border container with an explicit "not priced" badge per hint + verify/dismiss.
   The quarantine border is the design enforcement of *narrative never prices*.
6. **CTA:** "Open draft estimate" → the editor.

**Five states:** *empty* = inbox zero ("Share your link" + copy-link/QR buttons — the
empty state sells the loop) · *loading* = skeleton rows · *ideal* = above · *degraded* =
thin county data (range carries "+6% — priced from regional data" driver; shown as a
driver like any other, not an apology banner) OR no narrative (hints section simply
absent — not "no hints found") · *error* = draft generation failed: lead shown with
contact + scopes and "draft couldn't be priced — retry"; the lead is never lost.

## 4. Screen: Draft estimate editor (US-014 preview; hero #3)

Designed now, built in EP-03. Line list grouped by cost code division; each line shows
description, qty × uom × unit → total, and a **provenance badge** (US-012): `market` (grey)
/ `learned` (accent — "from your jobs") / `edited` (filled). Tap line → bottom-sheet editor
(mobile) with qty/unit/total fields. Range recomputes live in a sticky footer; drivers
update as edits land. Markups collapsed section, ordered (US-015). "Send" is EP-03.
**Five states:** *empty* = no lines (assembly selection produced nothing — shows which
toggles fired and "add lines manually") · *loading* = skeleton lines under a real range ·
*ideal* · *degraded* = PARTIAL generation (a toggle with no mapped assembly renders as an
explicit unpriced section: "basement — no assembly mapped — not included in range"; never
silently absent) · *error* = save conflict → newest-wins with visible "restored v{n}"
history affordance (versions are never destructive).

## 5. Components (one set, shared)

`RangeDisplay` (the typographic range + disclaimer) · `SwingDriverList` · `ScopeToggleCard`
(+ class chips) · `HintCard` (quarantined) · `ProvenanceBadge` · `EstimateLineRow` ·
`ChannelTag` · `StepperField` / `SkippableField` (renders the widen-copy on skip) ·
`PlatformChrome` (GC identity slot, D12). Form skins compose the same field components —
a test asserts both routes render identical field ids (US-005 contract).

## 6. What is deliberately absent

No homeowner-side price. No dashboards/charts (nothing to chart yet). No onboarding tour
(zero-setup IS the onboarding). No dark mode at launch. No enrichment UI (ADR-002). No
payment anything (D6).
