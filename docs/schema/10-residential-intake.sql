-- ============================================================================
-- 10 RESIDENTIAL INTAKE, PROPOSALS & MARKET SEED  (GC_intersection, 2026-07-18)
-- Extends Platform Data Model v1.0. Runs AFTER 00-launch-subset.sql.
-- Implements decision ledger D1–D12 (SESSION-CONTEXT.md):
--   * Zero-setup front door: pre-project homeowner intake, dual-door
--     (embed | link | qr) with channel attribution (D5).
--   * Concept estimates as a CLASS with range + swing drivers; hard gate —
--     concept never converts to budget/SOV (D1). Gate is app-layer; class
--     column makes it enforceable.
--   * Market seed beside the org cost database; learned cost_items beat
--     market seed (US-021).
--   * Narrative sets context, never price (D4): scope hints are suggestions
--     with ai_jobs + verified_by, no FK into pricing.
--   * Proposal/acceptance as first-class timestamped events (D6 hygiene);
--     acceptance freezes an immutable estimate version (D7).
--   * Conventions inherited: UUID PKs, org_id RLS via app.org_id GUC,
--     touch triggers, soft delete, money NUMERIC(15,2).
-- ============================================================================

CREATE TYPE intake_channel   AS ENUM ('embed','link','qr');
CREATE TYPE intake_status    AS ENUM ('submitted','converted','spam','discarded');
CREATE TYPE estimate_class   AS ENUM ('concept','plan_derived','contracted');
CREATE TYPE proposal_status  AS ENUM ('draft','sent','viewed','accepted','declined','expired','withdrawn');
  -- NOTE: 'declined' behavior undefined (US-026). State exists; no workflow
  -- may be built against it until the decline path is specified.
CREATE TYPE scope_class      AS ENUM ('in_place','reconfigure','relocate');
CREATE TYPE finish_tier      AS ENUM ('economy','mid','custom');
CREATE TYPE hint_kind        AS ENUM ('scope_hint','risk_flag');
CREATE TYPE market_seed_source AS ENUM ('fixture','onebuild');

-- ----------------------------------------------------------------------------
-- INTAKE FRONT DOOR (D5)
-- ----------------------------------------------------------------------------

-- One row per shareable door. A GC may hold many (site embed, truck QR,
-- per-campaign links). slug is the public URL key.
CREATE TABLE intake_links (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id        uuid NOT NULL REFERENCES organizations(id),
  slug          text NOT NULL,
  channel       intake_channel NOT NULL DEFAULT 'link',
  label         text,                       -- 'Website embed', 'Spring yard signs'
  display_name  text,                       -- GC name shown on hosted page
  logo_document_id uuid REFERENCES documents(id),
  is_active     boolean NOT NULL DEFAULT true,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  revision      bigint NOT NULL DEFAULT 1,
  deleted_at    timestamptz
);
CREATE UNIQUE INDEX idx_intake_links_slug ON intake_links (slug) WHERE deleted_at IS NULL;

-- Address-keyed public-data pull (assessor, permits, historic GIS). Versioned
-- provenance for pre-filled conditions (D2). Gated on ADR-2; the table ships
-- regardless so fixture enrichment and live enrichment share one shape.
CREATE TABLE enrichment_snapshots (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id        uuid NOT NULL REFERENCES organizations(id),
  address_normalized text NOT NULL,
  provider      text NOT NULL DEFAULT 'fixture',  -- fixture | dc_assessor | ...
  raw_payload   jsonb NOT NULL DEFAULT '{}',
  extracted     jsonb NOT NULL DEFAULT '{}',      -- {year_built, gsf, stories, historic_district, permit_history:[...]}
  fetched_at    timestamptz NOT NULL DEFAULT now(),
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  revision      bigint NOT NULL DEFAULT 1,
  deleted_at    timestamptz
);

-- The homeowner's submission. Structured payload sets price; narrative sets
-- context (D4). Conversion provenance: project_id + estimate_id filled by the
-- auto-create flow (US-007), never by hand.
CREATE TABLE intake_submissions (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id        uuid NOT NULL REFERENCES organizations(id),
  intake_link_id uuid NOT NULL REFERENCES intake_links(id),
  channel       intake_channel NOT NULL,    -- snapshot at submit time
  status        intake_status NOT NULL DEFAULT 'submitted',
  -- contact (homeowner has no account; EP-01 non-goal)
  contact_name  text,
  contact_email text,
  contact_phone text,
  -- structured payload (prices)
  address_line1 text NOT NULL,
  address_line2 text,
  city          text NOT NULL,
  state         text NOT NULL,
  postal_code   text NOT NULL,
  county_fips   text,                       -- derived; keys the market seed
  square_footage numeric(15,4),
  existing_config jsonb NOT NULL DEFAULT '{}',   -- beds/baths/etc as-is
  target_config  jsonb NOT NULL DEFAULT '{}',    -- beds/baths/etc desired
  conditions    jsonb NOT NULL DEFAULT '{}',     -- {year_built, occupied, access, known_problems:[...]} (D2)
  scope_toggles jsonb NOT NULL DEFAULT '{}',     -- {bath:{on:true,class:'reconfigure'}, kitchen:{...}} (US-006)
  structural_flags jsonb NOT NULL DEFAULT '{}',  -- {walls_removed:true, addition:false, ...}
  finish_tier   finish_tier,
  -- narrative (context only — no pricing path reads this column)
  narrative     text,
  -- provenance
  enrichment_snapshot_id uuid REFERENCES enrichment_snapshots(id),
  project_id    uuid REFERENCES projects(id),
  estimate_id   uuid REFERENCES estimates(id),
  submitted_at  timestamptz NOT NULL DEFAULT now(),
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  revision      bigint NOT NULL DEFAULT 1,
  deleted_at    timestamptz
);
CREATE INDEX idx_intake_submissions_link ON intake_submissions (intake_link_id, submitted_at) WHERE deleted_at IS NULL;
CREATE INDEX idx_intake_submissions_org  ON intake_submissions (org_id, status) WHERE deleted_at IS NULL;

-- Narrative extraction output (US-005b). Suggestions to the GC, never inputs
-- to pricing. Every row traces to an ai_jobs row; verified_by per platform
-- convention (nothing AI-extracted is trusted without sign-off).
CREATE TABLE intake_scope_hints (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id        uuid NOT NULL REFERENCES organizations(id),
  intake_submission_id uuid NOT NULL REFERENCES intake_submissions(id),
  kind          hint_kind NOT NULL,
  text          text NOT NULL,              -- 'Basement moisture mentioned — possible remediation scope'
  source_excerpt text,                      -- the narrative phrase it came from
  ai_job_id     uuid REFERENCES ai_jobs(id),
  ai_confidence numeric(5,4),
  verified_by   uuid REFERENCES users(id),
  dismissed_at  timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  revision      bigint NOT NULL DEFAULT 1,
  deleted_at    timestamptz
);

-- ----------------------------------------------------------------------------
-- MARKET SEED (the zero-setup answer to an empty org cost database)
-- ----------------------------------------------------------------------------

-- Platform-global (no org_id — same posture as companies): county-keyed
-- market costs. FixtureCostProvider reads rows where source='fixture';
-- OneBuildCostProvider (US-013, parked) would populate source='onebuild'.
-- Seed precedence (US-021): a learned org cost_item ALWAYS beats a row here.
CREATE TABLE market_cost_items (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  county_fips   text NOT NULL,
  msa_code      text,
  code          text,
  name          text NOT NULL,
  cost_code_id  uuid REFERENCES cost_codes(id),
  uom           text NOT NULL REFERENCES units_of_measure(code),
  labor_unit_cost     numeric(15,4) NOT NULL DEFAULT 0,
  material_unit_cost  numeric(15,4) NOT NULL DEFAULT 0,
  equipment_unit_cost numeric(15,4) NOT NULL DEFAULT 0,
  sub_unit_cost       numeric(15,4) NOT NULL DEFAULT 0,
  source        market_seed_source NOT NULL DEFAULT 'fixture',
  effective_date date NOT NULL DEFAULT CURRENT_DATE,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  revision      bigint NOT NULL DEFAULT 1,
  deleted_at    timestamptz
);
CREATE INDEX idx_market_cost_lookup ON market_cost_items (county_fips, cost_code_id) WHERE deleted_at IS NULL;

-- Modifier multipliers layered on assemblies (D3). org_id NULL = platform
-- seed rows; org rows override. Unknown dimension values at estimate time
-- WIDEN the range — they never silently default (US-011).
CREATE TABLE assembly_modifiers (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id        uuid REFERENCES organizations(id),   -- null = platform seed
  assembly_id   uuid REFERENCES assemblies(id),      -- null = applies to all
  dimension     text NOT NULL,              -- 'scope_class' | 'condition' | 'finish_tier'
  dim_key       text NOT NULL,              -- 'reconfigure', 'pre_1940', 'custom'
  multiplier    numeric(9,4) NOT NULL DEFAULT 1.0,
  range_widen_pct numeric(9,4) NOT NULL DEFAULT 0,   -- uncertainty this dimension adds
  notes         text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  revision      bigint NOT NULL DEFAULT 1,
  deleted_at    timestamptz
);

-- ----------------------------------------------------------------------------
-- PROPOSALS & ACCEPTANCE (EP-03/EP-05; D6 hygiene, D7 snapshot)
-- ----------------------------------------------------------------------------

-- The GC->homeowner bid. Points at ONE estimate version; on acceptance that
-- version's locked_at is set and it becomes immutable (D7, app-enforced +
-- guard trigger below). NOTE (D6): no payment objects exist by design.
CREATE TABLE proposals (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id        uuid NOT NULL REFERENCES organizations(id),
  project_id    uuid NOT NULL REFERENCES projects(id),
  estimate_version_id uuid NOT NULL REFERENCES estimate_versions(id),
  status        proposal_status NOT NULL DEFAULT 'draft',
  pdf_document_id uuid REFERENCES documents(id),     -- rendered bid (US-016)
  recipient_name  text,
  recipient_email text,
  expires_at    timestamptz,
  sent_at       timestamptz,
  accepted_at   timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  revision      bigint NOT NULL DEFAULT 1,
  deleted_at    timestamptz
);

-- Tokenized buyer access — no homeowner account (EP-01 non-goal). Store a
-- hash, never the token. Single active token per proposal at the app layer.
CREATE TABLE proposal_access_tokens (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id        uuid NOT NULL REFERENCES organizations(id),
  proposal_id   uuid NOT NULL REFERENCES proposals(id),
  token_hash    text NOT NULL,
  expires_at    timestamptz NOT NULL,
  revoked_at    timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  revision      bigint NOT NULL DEFAULT 1,
  deleted_at    timestamptz
);
CREATE UNIQUE INDEX idx_proposal_token_hash ON proposal_access_tokens (token_hash);

-- First-class timestamped lifecycle events (US-018 state machine; D6 hygiene:
-- the door stays unlocked without payments scaffolding). Append-only.
CREATE TABLE proposal_events (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id        uuid NOT NULL REFERENCES organizations(id),
  proposal_id   uuid NOT NULL REFERENCES proposals(id),
  event         proposal_status NOT NULL,   -- transition target
  actor_kind    text NOT NULL,              -- 'gc_user' | 'buyer_token' | 'system'
  actor_user_id uuid REFERENCES users(id),
  actor_token_id uuid REFERENCES proposal_access_tokens(id),
  occurred_at   timestamptz NOT NULL DEFAULT now(),
  meta          jsonb NOT NULL DEFAULT '{}',
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_proposal_events ON proposal_events (proposal_id, occurred_at);

-- In-platform notification inbox (US-008). audit_log is not an inbox.
CREATE TABLE notifications (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id        uuid NOT NULL REFERENCES organizations(id),
  user_id       uuid NOT NULL REFERENCES users(id),
  kind          text NOT NULL,              -- 'intake_received' | 'proposal_viewed' | 'proposal_accepted' | ...
  subject_table text NOT NULL,
  subject_id    uuid NOT NULL,
  title         text NOT NULL,
  body          text,
  read_at       timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  revision      bigint NOT NULL DEFAULT 1,
  deleted_at    timestamptz
);
CREATE INDEX idx_notifications_inbox ON notifications (user_id, read_at, created_at) WHERE deleted_at IS NULL;

-- ----------------------------------------------------------------------------
-- AMENDMENTS TO DOMAINS 01 / 07 / 09 (decision-ledger requirements)
-- ----------------------------------------------------------------------------

-- D1: estimate class; concept output is a range with named swing drivers.
ALTER TABLE estimates
  ADD COLUMN class estimate_class NOT NULL DEFAULT 'concept',
  ADD COLUMN intake_submission_id uuid REFERENCES intake_submissions(id);
ALTER TABLE estimate_versions
  ADD COLUMN range_low  numeric(15,2),
  ADD COLUMN range_high numeric(15,2),
  ADD COLUMN swing_drivers jsonb NOT NULL DEFAULT '[]';  -- [{driver, widen_amount, source}]

-- D8 lint fix: estimate_lines lack stable identity across versions.
-- lineage_id is constant for "the same line" through every version — this is
-- what US-019 (edit->observation) and US-022 (edit distance/coverage) diff on.
ALTER TABLE estimate_lines
  ADD COLUMN lineage_id uuid NOT NULL DEFAULT gen_random_uuid(),
  ADD COLUMN seed_source text,                    -- 'market_seed' | 'learned' | 'gc_edit' (US-012 provenance)
  ADD COLUMN market_cost_item_id uuid REFERENCES market_cost_items(id);
CREATE INDEX idx_estimate_lines_lineage ON estimate_lines (lineage_id);

-- US-019: feasibility keys on observations so learned costs teach the
-- concept layer along the dimensions the intake captures.
ALTER TABLE benchmark_observations
  ADD COLUMN scope_class scope_class,
  ADD COLUMN finish_tier finish_tier,
  ADD COLUMN condition_keys jsonb NOT NULL DEFAULT '{}';

-- D7 guard: once an estimate version is locked (acceptance), its lines are
-- immutable. Belt-and-suspenders under the app-layer rule.
CREATE OR REPLACE FUNCTION guard_locked_estimate_version() RETURNS trigger AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM estimate_versions v
    WHERE v.id = COALESCE(NEW.estimate_version_id, OLD.estimate_version_id)
      AND v.locked_at IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'estimate version is locked (accepted); create a new version';
  END IF;
  RETURN COALESCE(NEW, OLD);
END; $$ LANGUAGE plpgsql;

CREATE TRIGGER trg_guard_locked_lines
  BEFORE INSERT OR UPDATE OR DELETE ON estimate_lines
  FOR EACH ROW EXECUTE FUNCTION guard_locked_estimate_version();
CREATE TRIGGER trg_guard_locked_markups
  BEFORE INSERT OR UPDATE OR DELETE ON estimate_markups
  FOR EACH ROW EXECUTE FUNCTION guard_locked_estimate_version();

-- RLS + touch triggers: the platform DO blocks in 00-launch-subset.sql run
-- over information_schema, so tables in this file are covered automatically
-- IF this file executes BEFORE those blocks — otherwise re-run the two DO
-- blocks after this migration. (Migration tooling should order accordingly.)
-- market_cost_items intentionally has no org_id (global, like companies).
