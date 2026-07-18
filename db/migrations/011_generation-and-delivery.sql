-- ============================================================================
-- 11 GENERATION, MAPPING & DELIVERY  (GC_intersection, 2026-07-18)
-- Runs AFTER 10-residential-intake.sql. Closes the five remaining gaps
-- between build-plan-v2 stories and the schema:
--   * scope_assembly_map     — the deterministic toggle->work wiring (US-010)
--   * counties               — geography source of truth for seed + enrichment
--   * estimate_generation_runs — the calculation trace: determinism as data
--   * org_estimating_profiles / markup_templates / org_service_areas
--                            — the GC's business defaults
--   * outbound_messages      — buyer-facing email delivery record (US-024)
-- Conventions inherited: UUID PKs, org_id RLS, touch triggers, soft delete.
-- ============================================================================

CREATE TYPE message_status AS ENUM ('queued','sent','delivered','bounced','failed','opened');

-- ----------------------------------------------------------------------------
-- GEOGRAPHY (platform-global, no org_id — like companies / market_cost_items)
-- ----------------------------------------------------------------------------
CREATE TABLE counties (
  fips          text PRIMARY KEY,           -- '11001'
  name          text NOT NULL,              -- 'District of Columbia'
  state_code    text NOT NULL,              -- 'DC'
  msa_code      text,                       -- CBSA
  msa_name      text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  revision      bigint NOT NULL DEFAULT 1,
  deleted_at    timestamptz
);
CREATE INDEX idx_counties_state ON counties (state_code) WHERE deleted_at IS NULL;

-- ----------------------------------------------------------------------------
-- SCOPE -> ASSEMBLY WIRING (US-010): data, not application code.
-- "bath + reconfigure" fires these assemblies with these parameter formulas.
-- Platform seed rows (org_id null) define defaults; org rows override.
-- Deterministic rule: for a given (toggle, scope_class), matching rows fire
-- in priority order; an org row with the same (toggle, scope_class,
-- assembly_id) replaces the platform row entirely.
-- ----------------------------------------------------------------------------
CREATE TABLE scope_assembly_map (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id        uuid REFERENCES organizations(id),   -- null = platform seed
  scope_toggle  text NOT NULL,              -- 'bath' | 'kitchen' | 'floors' | ... (US-006 list)
  scope_class   scope_class,                -- null = applies to all classes
  assembly_id   uuid NOT NULL REFERENCES assemblies(id),
  priority      integer NOT NULL DEFAULT 0,
  param_bindings jsonb NOT NULL DEFAULT '{}',  -- {"unit_sf": "submission.square_footage * 0.12"}
  is_active     boolean NOT NULL DEFAULT true,
  notes         text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  revision      bigint NOT NULL DEFAULT 1,
  deleted_at    timestamptz
);
CREATE INDEX idx_scope_map_lookup ON scope_assembly_map (scope_toggle, scope_class) WHERE deleted_at IS NULL AND is_active;

-- ----------------------------------------------------------------------------
-- CALCULATION TRACE (determinism as data). One row per draft generation.
-- Re-running a trace with the same inputs_snapshot MUST reproduce the same
-- estimate version — that is the definition of deterministic for this product,
-- and this table is what makes "where did this number come from?" a query.
-- ----------------------------------------------------------------------------
CREATE TABLE estimate_generation_runs (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id        uuid NOT NULL REFERENCES organizations(id),
  intake_submission_id uuid REFERENCES intake_submissions(id),
  estimate_version_id  uuid REFERENCES estimate_versions(id),  -- what it produced
  cost_provider text NOT NULL,              -- 'FixtureCostProvider' | 'OneBuildCostProvider'
  provider_version text,                    -- fixture dataset version / API version
  inputs_snapshot jsonb NOT NULL,           -- frozen: submission payload + enrichment extract used
  assemblies_fired jsonb NOT NULL DEFAULT '[]',  -- [{scope_toggle, scope_class, assembly_id, map_row_id, params}]
  modifiers_applied jsonb NOT NULL DEFAULT '[]', -- [{dimension, dim_key, multiplier, range_widen_pct, source_row_id}]
  precedence_log jsonb NOT NULL DEFAULT '[]',    -- per line: learned cost_item vs market seed, which won (US-021)
  unknowns jsonb NOT NULL DEFAULT '[]',          -- unanswered dimensions -> range widening (US-011: never silent)
  range_low  numeric(15,2),
  range_high numeric(15,2),
  grand_total numeric(15,2),
  started_at  timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  error       text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  revision      bigint NOT NULL DEFAULT 1,
  deleted_at    timestamptz
);
CREATE INDEX idx_generation_runs_estimate ON estimate_generation_runs (estimate_version_id);

-- ----------------------------------------------------------------------------
-- THE GC'S BUSINESS DEFAULTS
-- ----------------------------------------------------------------------------

-- Org-level markup template; seeds estimate_markups on every new draft.
CREATE TABLE markup_templates (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id        uuid NOT NULL REFERENCES organizations(id),
  apply_order   integer NOT NULL,
  name          text NOT NULL,              -- 'Overhead', 'Profit'
  markup_kind   text NOT NULL DEFAULT 'pct_of_running_total',
  rate_pct      numeric(9,6),
  fixed_amount  numeric(15,2),
  is_active     boolean NOT NULL DEFAULT true,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  revision      bigint NOT NULL DEFAULT 1,
  deleted_at    timestamptz
);

-- Which counties the GC serves. Intake validates against this; a submission
-- outside the service area is accepted but flagged (GC decides, not the form).
CREATE TABLE org_service_areas (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id        uuid NOT NULL REFERENCES organizations(id),
  county_fips   text NOT NULL REFERENCES counties(fips),
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  revision      bigint NOT NULL DEFAULT 1,
  deleted_at    timestamptz,
  UNIQUE (org_id, county_fips)
);

-- ----------------------------------------------------------------------------
-- OUTBOUND DELIVERY (US-024: the buyer receives a link — by email).
-- Provider-agnostic; provider_ref carries the ESP message id for webhooks.
-- ----------------------------------------------------------------------------
CREATE TABLE outbound_messages (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id        uuid NOT NULL REFERENCES organizations(id),
  kind          text NOT NULL,              -- 'proposal_delivery' | 'proposal_reminder'
  subject_table text NOT NULL,              -- 'proposals'
  subject_id    uuid NOT NULL,
  recipient_email text NOT NULL,
  status        message_status NOT NULL DEFAULT 'queued',
  provider      text,                       -- 'resend' | 'ses' | ...
  provider_ref  text,
  queued_at     timestamptz NOT NULL DEFAULT now(),
  sent_at       timestamptz,
  delivered_at  timestamptz,
  bounced_at    timestamptz,
  opened_at     timestamptz,
  error         text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  revision      bigint NOT NULL DEFAULT 1,
  deleted_at    timestamptz
);
CREATE INDEX idx_outbound_subject ON outbound_messages (subject_table, subject_id);
CREATE INDEX idx_outbound_status  ON outbound_messages (status, queued_at) WHERE deleted_at IS NULL;

-- ----------------------------------------------------------------------------
-- AMENDMENTS
-- ----------------------------------------------------------------------------

-- intake submissions gain the service-area flag (set by app at submit time)
ALTER TABLE intake_submissions
  ADD COLUMN outside_service_area boolean NOT NULL DEFAULT false;

-- county_fips columns now have a source of truth
ALTER TABLE intake_submissions
  ADD CONSTRAINT fk_submission_county FOREIGN KEY (county_fips) REFERENCES counties(fips);
ALTER TABLE market_cost_items
  ADD CONSTRAINT fk_market_county FOREIGN KEY (county_fips) REFERENCES counties(fips);

-- Reminder: re-run the platform touch-trigger + RLS DO blocks after this
-- migration (they iterate information_schema; new tables here need coverage).
-- counties and scope_assembly_map platform-seed rows (org_id null) are
-- global reads — RLS policy must permit org_id IS NULL rows on scope_assembly_map.
