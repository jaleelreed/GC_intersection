-- ============================================================================
-- CONSTRUCTION OS — DATA MODEL v1.0 (2026-07-15)
-- Target: PostgreSQL 16 (Neon). Prepared for Rule Enterprises.
-- Design sources: Procore public API object model (rebuilt/simplified),
-- BuildingConnected (bid board, coverage, network), Levelset (statutory
-- waivers), GCPay (pay-app/waiver exchange), Siteline (carry-forward billing),
-- TradeTapp (prequal scoring), Fieldwire (offline-first sync).
--
-- Conventions:
--   * UUID PKs, client-generatable (offline-first).
--   * Every tenant table carries org_id; RLS enforced via app.org_id GUC.
--   * updated_at + revision maintained by trigger; soft delete via deleted_at.
--   * Money NUMERIC(15,2); rates/percents NUMERIC(9,4); qty NUMERIC(15,4).
--   * State machines are enums; every transition is written to audit_log.
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;   -- gen_random_uuid
CREATE EXTENSION IF NOT EXISTS vector;     -- pgvector: embeddings
CREATE EXTENSION IF NOT EXISTS pg_trgm;    -- fuzzy directory search
CREATE EXTENSION IF NOT EXISTS btree_gist; -- exclusion constraints (date ranges)

-- ----------------------------------------------------------------------------
-- ENUMS
-- ----------------------------------------------------------------------------
CREATE TYPE org_role AS ENUM ('owner_admin','project_manager','accounting','field','read_only');
CREATE TYPE collaborator_role AS ENUM ('sub_collaborator','owner_rep','architect_engineer','lender_agency_viewer');
CREATE TYPE project_stage AS ENUM ('pursuit','preconstruction','course_of_construction','closeout','warranty','archived');
CREATE TYPE construction_type AS ENUM ('wood_frame','podium','steel','concrete','masonry','modular','rehab','other');
CREATE TYPE project_sector AS ENUM ('multifamily_affordable','multifamily_market','mixed_use','commercial','public_institutional','residential','industrial','other');
CREATE TYPE cost_type AS ENUM ('labor','material','equipment','subcontract','general_conditions','soft_cost','other');
CREATE TYPE commitment_type AS ENUM ('subcontract','purchase_order');
CREATE TYPE commitment_status AS ENUM ('draft','out_for_signature','executed','complete','terminated','void');
CREATE TYPE change_scope AS ENUM ('prime','commitment','budget_only');
CREATE TYPE change_status AS ENUM ('draft','pending_pricing','submitted','approved','rejected','void');
CREATE TYPE change_reason AS ENUM ('owner_directive','design_clarification','field_condition','allowance_reconciliation','value_engineering','error_omission','weather_force_majeure','other');
CREATE TYPE invoice_status AS ENUM ('draft','submitted','under_review','revise_resubmit','approved','paid','void');
CREATE TYPE pay_app_status AS ENUM ('draft','internal_review','submitted_to_owner','certified','funded','void');
CREATE TYPE payment_method AS ENUM ('ach','check','wire','credit_card','other');
CREATE TYPE payment_status AS ENUM ('scheduled','blocked','processing','cleared','failed','void');
CREATE TYPE waiver_type AS ENUM ('conditional_progress','unconditional_progress','conditional_final','unconditional_final');
CREATE TYPE waiver_status AS ENUM ('required','requested','sent','signed','received','rejected','waived_off');
CREATE TYPE hold_reason AS ENUM ('missing_lien_waiver','lapsed_insurance','missing_certified_payroll','expired_certification','contract_not_executed','manual_hold','failed_inspection','overbilling_flag');
CREATE TYPE draw_status AS ENUM ('assembling','internal_review','submitted','lender_review','revisions_requested','approved','funded');
CREATE TYPE rfi_status AS ENUM ('draft','open','answered','closed','void');
CREATE TYPE submittal_status AS ENUM ('draft','open','in_review','returned','closed','void');
CREATE TYPE submittal_disposition AS ENUM ('approved','approved_as_noted','revise_resubmit','rejected','for_record_only');
CREATE TYPE punch_status AS ENUM ('open','in_progress','ready_for_review','closed','disputed');
CREATE TYPE bid_package_status AS ENUM ('draft','open','leveling','awarded','closed','cancelled');
CREATE TYPE invitation_status AS ENUM ('draft','sent','viewed','intends_to_bid','declined','submitted','withdrawn');
CREATE TYPE bid_status AS ENUM ('draft','submitted','shortlisted','awarded','not_awarded','withdrawn');
CREATE TYPE scope_inclusion AS ENUM ('included','excluded','alternate','allowance','unit_price');
CREATE TYPE estimate_status AS ENUM ('draft','in_progress','internal_review','submitted','won','lost','archived');
CREATE TYPE cert_program AS ENUM ('mbe','wbe','dbe','sbe','section3_business','veteran','8a','hubzone','other');
CREATE TYPE benchmark_source AS ENUM ('estimate','bid_received','buyout','change_order','actual_cost');
CREATE TYPE doc_category AS ENUM ('drawing','specification','contract','invoice','pay_application','lien_waiver','insurance','certified_payroll','photo','submittal','rfi','report','correspondence','bid_document','other');
CREATE TYPE ai_job_type AS ENUM ('extract_invoice','extract_bid','extract_coi','extract_payroll','extract_drawing_meta','draft_rfi','draft_daily_log','level_bids','classify_photo','summarize','other');
CREATE TYPE ai_job_status AS ENUM ('queued','running','complete','failed','verified','rejected');

-- ----------------------------------------------------------------------------
-- TENANCY & IDENTITY
-- ----------------------------------------------------------------------------
CREATE TABLE organizations (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name          text NOT NULL,
  legal_name    text,
  ein           text,                       -- encrypted at app layer
  org_kind      text NOT NULL DEFAULT 'general_contractor',  -- gc | sub | developer_builder | owner
  logo_document_id uuid,                    -- FK added after documents
  settings      jsonb NOT NULL DEFAULT '{}',-- feature flags, numbering formats
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  revision      bigint NOT NULL DEFAULT 1,
  deleted_at    timestamptz
);

CREATE TABLE users (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email         text NOT NULL,              -- uniqueness on lower(email) below
  full_name     text NOT NULL,
  phone         text,
  avatar_url    text,
  auth_provider_id text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  revision      bigint NOT NULL DEFAULT 1,
  deleted_at    timestamptz
);
CREATE UNIQUE INDEX idx_users_email ON users (lower(email));

-- Simple 5-role model (deliberate: Procore's granular permission matrix is a
-- top usability complaint; roles + project membership cover the segment).
CREATE TABLE org_memberships (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id        uuid NOT NULL REFERENCES organizations(id),
  user_id       uuid NOT NULL REFERENCES users(id),
  role          org_role NOT NULL DEFAULT 'field',
  title         text,
  is_active     boolean NOT NULL DEFAULT true,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  revision      bigint NOT NULL DEFAULT 1,
  deleted_at    timestamptz,
  UNIQUE (org_id, user_id)
);

-- ----------------------------------------------------------------------------
-- PROJECTS
-- ----------------------------------------------------------------------------
CREATE TABLE projects (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id        uuid NOT NULL REFERENCES organizations(id),
  code          text NOT NULL,              -- short job number, org-unique
  name          text NOT NULL,
  stage         project_stage NOT NULL DEFAULT 'preconstruction',
  sector        project_sector NOT NULL DEFAULT 'multifamily_affordable',
  construction_kind construction_type,
  delivery_method text,                     -- gmp | design_build | cmar | lump_sum
  address_line1 text, address_line2 text, city text, state char(2), zip text,
  county        text,
  msa_code      text,                       -- CBSA code: benchmarking market key
  latitude      numeric(9,6), longitude numeric(9,6),
  -- Normalization attributes (benchmarking denominators)
  unit_count    integer,
  gross_sf      numeric(12,0),
  residential_sf numeric(12,0),
  stories       integer,
  -- Public-funding context (drives compliance engine activation)
  is_prevailing_wage boolean NOT NULL DEFAULT false,
  wage_law      text,                       -- davis_bacon | state_prevailing | none
  has_section3  boolean NOT NULL DEFAULT false,
  funding_programs text[],                  -- {lihtc_4pct, lihtc_9pct, home, cdbg, ...}
  start_date    date, substantial_completion date, final_completion date,
  settings      jsonb NOT NULL DEFAULT '{}',
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  revision      bigint NOT NULL DEFAULT 1,
  deleted_at    timestamptz,
  UNIQUE (org_id, code)
);

CREATE TABLE project_members (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id        uuid NOT NULL REFERENCES organizations(id),
  project_id    uuid NOT NULL REFERENCES projects(id),
  user_id       uuid NOT NULL REFERENCES users(id),
  role_override org_role,                   -- null = inherit org role
  external_role collaborator_role,          -- set when user is outside the org
  company_id    uuid,                       -- FK to companies added in 02
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  revision      bigint NOT NULL DEFAULT 1,
  deleted_at    timestamptz,
  UNIQUE (project_id, user_id)
);

-- Hierarchical locations (building > floor > unit). First-class for
-- multifamily: punch, photos, inspections, and turnover all key off unit.
CREATE TABLE locations (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id        uuid NOT NULL REFERENCES organizations(id),
  project_id    uuid NOT NULL REFERENCES projects(id),
  parent_id     uuid REFERENCES locations(id),
  name          text NOT NULL,              -- "Bldg A" / "Floor 3" / "Unit 304"
  kind          text NOT NULL DEFAULT 'area',  -- building|floor|unit|area|site
  unit_type     text,                       -- "1BR/1BA 640sf" for unit-kind rows
  sort_order    integer NOT NULL DEFAULT 0,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  revision      bigint NOT NULL DEFAULT 1,
  deleted_at    timestamptz
);

-- ----------------------------------------------------------------------------
-- DOCUMENTS (universal, versioned file store; every domain object points here)
-- ----------------------------------------------------------------------------
CREATE TABLE documents (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id        uuid NOT NULL REFERENCES organizations(id),
  project_id    uuid REFERENCES projects(id),      -- null = org-level (W-9s etc.)
  category      doc_category NOT NULL DEFAULT 'other',
  title         text NOT NULL,
  current_version_id uuid,                          -- FK added below
  is_private    boolean NOT NULL DEFAULT false,     -- hidden from collaborators
  created_by    uuid REFERENCES users(id),
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  revision      bigint NOT NULL DEFAULT 1,
  deleted_at    timestamptz
);

CREATE TABLE document_versions (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id        uuid NOT NULL REFERENCES organizations(id),
  document_id   uuid NOT NULL REFERENCES documents(id),
  version_no    integer NOT NULL,
  storage_key   text NOT NULL,              -- object-store path
  mime_type     text NOT NULL,
  byte_size     bigint NOT NULL,
  sha256        text NOT NULL,              -- dedupe + integrity
  page_count    integer,
  uploaded_by   uuid REFERENCES users(id),
  created_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (document_id, version_no)
);
ALTER TABLE documents
  ADD CONSTRAINT fk_documents_current_version
  FOREIGN KEY (current_version_id) REFERENCES document_versions(id);
ALTER TABLE organizations
  ADD CONSTRAINT fk_org_logo FOREIGN KEY (logo_document_id) REFERENCES documents(id);

-- AI-NATIVE LAYER: every document chunked + embedded AT WRITE TIME. This is
-- what makes conversational search, drafting, and analytics free downstream.
CREATE TABLE document_chunks (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id        uuid NOT NULL REFERENCES organizations(id),
  document_version_id uuid NOT NULL REFERENCES document_versions(id),
  chunk_index   integer NOT NULL,
  page_no       integer,
  content       text NOT NULL,
  embedding     vector(1024),
  created_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (document_version_id, chunk_index)
);

-- All AI work is a job with confidence + mandatory human verification state.
-- (Compliance liability control: outputs are "prepared by AI, verified by human".)
CREATE TABLE ai_jobs (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id        uuid NOT NULL REFERENCES organizations(id),
  project_id    uuid REFERENCES projects(id),
  job_type      ai_job_type NOT NULL,
  status        ai_job_status NOT NULL DEFAULT 'queued',
  source_document_version_id uuid REFERENCES document_versions(id),
  target_table  text,                       -- where extraction landed
  target_id     uuid,
  result        jsonb,                      -- structured extraction payload
  confidence    numeric(5,4),
  model         text,
  verified_by   uuid REFERENCES users(id),
  verified_at   timestamptz,
  error         text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  revision      bigint NOT NULL DEFAULT 1,
  deleted_at    timestamptz
);

-- ----------------------------------------------------------------------------
-- AUDIT + OFFLINE SYNC
-- ----------------------------------------------------------------------------
-- Universal audit: replaces Procore's "lock everything" pattern. History is
-- editable-with-trail, not frozen (their cascading change-order locks are the
-- #1 financial complaint).
CREATE TABLE audit_log (
  id            bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  org_id        uuid NOT NULL,
  project_id    uuid,
  table_name    text NOT NULL,
  row_id        uuid NOT NULL,
  action        text NOT NULL,              -- insert|update|delete|transition
  actor_user_id uuid,
  device_id     uuid,
  before        jsonb,
  after         jsonb,
  occurred_at   timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE devices (
  id            uuid PRIMARY KEY,           -- client-generated
  org_id        uuid NOT NULL REFERENCES organizations(id),
  user_id       uuid NOT NULL REFERENCES users(id),
  platform      text,                       -- ios|android|web
  last_synced_at timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now()
);

-- Oplog for offline-first sync (Fieldwire-grade field reliability is a stated
-- differentiator vs Procore's failing offline mode). Clients pull by cursor.
CREATE TABLE sync_changes (
  id            bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  org_id        uuid NOT NULL,
  project_id    uuid,
  table_name    text NOT NULL,
  row_id        uuid NOT NULL,
  op            text NOT NULL,              -- upsert|delete
  row_revision  bigint NOT NULL,
  origin_device uuid,
  committed_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_sync_changes_cursor ON sync_changes (org_id, id);
CREATE INDEX idx_sync_changes_project ON sync_changes (project_id, id);

-- Lookup: units of measure (normalization backbone for estimating/benchmarks)
CREATE TABLE units_of_measure (
  code          text PRIMARY KEY,           -- SF, SY, LF, EA, CY, TON, HR, LS, UNIT
  name          text NOT NULL,
  dimension     text NOT NULL               -- area|length|volume|count|time|weight|lump
);
-- ============================================================================
-- ============================================================================
-- FROM 03 (launch subset needs cost codes only)
-- ============================================================================
-- Cost code library (CSI MasterFormat seed + org custom codes). Hierarchical.
CREATE TABLE cost_codes (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id        uuid REFERENCES organizations(id),  -- null = platform CSI seed
  parent_id     uuid REFERENCES cost_codes(id),
  code          text NOT NULL,              -- '09 29 00'
  title         text NOT NULL,              -- 'Gypsum Board'
  csi_division  text,                       -- '09'
  is_active     boolean NOT NULL DEFAULT true,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  revision      bigint NOT NULL DEFAULT 1,
  deleted_at    timestamptz
);
CREATE UNIQUE INDEX idx_cost_codes_org_code
  ON cost_codes (COALESCE(org_id,'00000000-0000-0000-0000-000000000000'::uuid), code)
  WHERE deleted_at IS NULL;

-- ----------------------------------------------------------------------------
-- ============================================================================
-- 07 ESTIMATING & TAKEOFF
-- Design goals: (a) cost database seeded from the org's OWN history (bids,
-- buyouts, actuals) rather than generic published data; (b) AI takeoff from
-- drawing sheets with mandatory human verification; (c) one-click handoff:
-- won estimate -> budget lines + SOV skeleton (no re-keying from Excel).
-- ============================================================================

-- Company cost database. Rows are created manually OR harvested automatically
-- from benchmark_observations (bid/buyout/actual) — the flywheel writing back.
CREATE TABLE cost_items (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id        uuid NOT NULL REFERENCES organizations(id),
  code          text,
  name          text NOT NULL,              -- '5/8" Type X GWB, walls, hung+finished'
  cost_code_id  uuid REFERENCES cost_codes(id),
  uom           text NOT NULL REFERENCES units_of_measure(code),
  labor_unit_cost numeric(15,4) NOT NULL DEFAULT 0,
  material_unit_cost numeric(15,4) NOT NULL DEFAULT 0,
  equipment_unit_cost numeric(15,4) NOT NULL DEFAULT 0,
  sub_unit_cost numeric(15,4) NOT NULL DEFAULT 0,
  productivity_rate numeric(12,4),          -- units per labor hour
  effective_date date NOT NULL DEFAULT CURRENT_DATE,
  source        text NOT NULL DEFAULT 'manual',  -- manual | harvested_bid | harvested_actual
  source_observation_id uuid,               -- FK added in 09
  msa_code      text,                       -- localized pricing
  notes         text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  revision      bigint NOT NULL DEFAULT 1,
  deleted_at    timestamptz
);

-- Assemblies: parameterized bundles ('Typical 1BR unit interior finish
-- package') expanding to component cost items by formula.
CREATE TABLE assemblies (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id        uuid NOT NULL REFERENCES organizations(id),
  name          text NOT NULL,
  description   text,
  uom           text NOT NULL REFERENCES units_of_measure(code),  -- EA unit, SF, etc.
  parameters    jsonb NOT NULL DEFAULT '{}',   -- {"unit_sf": 640, "bath_count": 1}
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  revision      bigint NOT NULL DEFAULT 1,
  deleted_at    timestamptz
);

CREATE TABLE assembly_components (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id        uuid NOT NULL REFERENCES organizations(id),
  assembly_id   uuid NOT NULL REFERENCES assemblies(id),
  cost_item_id  uuid NOT NULL REFERENCES cost_items(id),
  quantity_formula text NOT NULL,           -- 'unit_sf * 2.8' (wall SF factor)
  waste_pct     numeric(9,6) NOT NULL DEFAULT 0,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  revision      bigint NOT NULL DEFAULT 1,
  deleted_at    timestamptz
);

-- ----------------------------------------------------------------------------
-- ESTIMATES
-- ----------------------------------------------------------------------------
CREATE TABLE estimates (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id        uuid NOT NULL REFERENCES organizations(id),
  project_id    uuid REFERENCES projects(id),   -- null until pursuit becomes project
  name          text NOT NULL,
  status        estimate_status NOT NULL DEFAULT 'draft',
  current_version_id uuid,                  -- FK below
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  revision      bigint NOT NULL DEFAULT 1,
  deleted_at    timestamptz
);

CREATE TABLE estimate_versions (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id        uuid NOT NULL REFERENCES organizations(id),
  estimate_id   uuid NOT NULL REFERENCES estimates(id),
  version_no    integer NOT NULL DEFAULT 1,
  label         text,                       -- 'SD Estimate', 'GMP', 'Buyout Target'
  base_total    numeric(15,2) NOT NULL DEFAULT 0,
  markup_total  numeric(15,2) NOT NULL DEFAULT 0,
  grand_total   numeric(15,2) NOT NULL DEFAULT 0,
  locked_at     timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  revision      bigint NOT NULL DEFAULT 1,
  deleted_at    timestamptz,
  UNIQUE (estimate_id, version_no)
);
ALTER TABLE estimates
  ADD CONSTRAINT fk_estimate_current_version
  FOREIGN KEY (current_version_id) REFERENCES estimate_versions(id);

CREATE TABLE estimate_lines (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id        uuid NOT NULL REFERENCES organizations(id),
  estimate_version_id uuid NOT NULL REFERENCES estimate_versions(id),
  sort_order    integer NOT NULL DEFAULT 0,
  cost_code_id  uuid REFERENCES cost_codes(id),
  cost_kind     cost_type NOT NULL DEFAULT 'subcontract',
  description   text NOT NULL,
  cost_item_id  uuid REFERENCES cost_items(id),
  assembly_id   uuid REFERENCES assemblies(id),
  takeoff_measurement_id uuid,              -- FK deferred: takeoff tables not in launch subset
  quantity      numeric(15,4) NOT NULL DEFAULT 0,
  uom           text REFERENCES units_of_measure(code),
  unit_cost     numeric(15,4) NOT NULL DEFAULT 0,
  total         numeric(15,2) NOT NULL DEFAULT 0,
  is_allowance  boolean NOT NULL DEFAULT false,
  is_alternate  boolean NOT NULL DEFAULT false,
  -- Benchmark check-in: variance vs org benchmark at time of estimate
  benchmark_unit_cost numeric(15,4),
  benchmark_variance_pct numeric(9,4),
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  revision      bigint NOT NULL DEFAULT 1,
  deleted_at    timestamptz
);
-- Markups applied in order (GCs, overhead, profit, bond, builder's risk,
-- contingency). Explicit ordering = auditable math, no spreadsheet mystery.
CREATE TABLE estimate_markups (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id        uuid NOT NULL REFERENCES organizations(id),
  estimate_version_id uuid NOT NULL REFERENCES estimate_versions(id),
  apply_order   integer NOT NULL,
  name          text NOT NULL,              -- 'General Conditions', 'Fee'
  markup_kind   text NOT NULL DEFAULT 'pct_of_running_total', -- pct_of_base | pct_of_running_total | fixed
  rate_pct      numeric(9,6),
  fixed_amount  numeric(15,2),
  computed_amount numeric(15,2) NOT NULL DEFAULT 0,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  revision      bigint NOT NULL DEFAULT 1,
  deleted_at    timestamptz
);

-- ============================================================================
-- 09 BENCHMARKING ENGINE + PLATFORM INFRASTRUCTURE (triggers, RLS, indexes)
-- The moat: every estimate line, bid, buyout, CO, and actual becomes a
-- normalized observation. Org-private by default; opt-in anonymized pooling
-- returns market intelligence to members (Procore keeps this; we give it back).
-- ============================================================================

CREATE TABLE benchmark_observations (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id        uuid NOT NULL REFERENCES organizations(id),
  project_id    uuid REFERENCES projects(id),
  source_kind   benchmark_source NOT NULL,
  source_table  text NOT NULL,              -- estimate_lines | bids | commitments | change_orders | direct_costs
  source_id     uuid NOT NULL,
  cost_code_id  uuid REFERENCES cost_codes(id),
  csi_division  text,
  observed_on   date NOT NULL DEFAULT CURRENT_DATE,
  -- Raw
  total_amount  numeric(15,2) NOT NULL,
  quantity      numeric(15,4),
  uom           text REFERENCES units_of_measure(code),
  unit_cost     numeric(15,4),
  -- Normalized denominators (from projects attributes at observation time)
  amount_per_unit numeric(15,4),            -- per dwelling unit
  amount_per_gsf numeric(15,6),
  -- Context keys
  msa_code      text,
  state         char(2),
  construction_kind construction_type,
  sector        project_sector,
  stories       integer,
  -- Pooling
  pooled        boolean NOT NULL DEFAULT false,   -- released to anonymized pool
  pooled_at     timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (source_table, source_id)
);
CREATE INDEX idx_bench_lookup ON benchmark_observations
  (cost_code_id, msa_code, construction_kind, observed_on);
CREATE INDEX idx_bench_pooled ON benchmark_observations
  (csi_division, msa_code, observed_on) WHERE pooled;

ALTER TABLE cost_items
  ADD CONSTRAINT fk_cost_item_observation
  FOREIGN KEY (source_observation_id) REFERENCES benchmark_observations(id);

-- Pool membership + consent (per-org, revocable; k-anonymity enforced by the
-- query layer: no stat returned unless >= 5 distinct orgs contribute)
CREATE TABLE benchmark_pool_memberships (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id        uuid NOT NULL REFERENCES organizations(id) UNIQUE,
  opted_in_at   timestamptz NOT NULL DEFAULT now(),
  revoked_at    timestamptz,
  share_scope   text NOT NULL DEFAULT 'division_level'  -- division_level | cost_code_level
);

-- Agency cost limits (HFA cost containment, LIHTC per-unit caps). The compare
-- engine renders estimate/budget vs limit in one view.
CREATE TABLE cost_limits (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agency        text NOT NULL,              -- 'WHEDA', 'AHFA', 'THDA'
  program       text NOT NULL,              -- 'lihtc_9pct_2026'
  limit_kind    text NOT NULL,              -- tdc_per_unit | hard_cost_per_gsf | basis_limit
  unit_context  text,                       -- bedroom count / construction type key
  amount        numeric(15,2) NOT NULL,
  effective_start date NOT NULL,
  effective_end date,
  source_url    text,
  created_at    timestamptz NOT NULL DEFAULT now()
);

-- ============================================================================
-- PLATFORM TRIGGERS: updated_at + revision + sync oplog, applied to every
-- table that has the standard columns. One definition, zero drift.
-- ============================================================================
CREATE OR REPLACE FUNCTION touch_row() RETURNS trigger AS $$
BEGIN
  NEW.updated_at := now();
  NEW.revision := OLD.revision + 1;
  RETURN NEW;
END $$ LANGUAGE plpgsql;

DO $$
DECLARE t record;
BEGIN
  FOR t IN
    SELECT c.table_name
    FROM information_schema.columns c
    JOIN information_schema.columns c2
      ON c2.table_name = c.table_name AND c2.column_name = 'revision'
    WHERE c.table_schema = 'public' AND c.column_name = 'updated_at'
    GROUP BY c.table_name
  LOOP
    EXECUTE format(
      'CREATE TRIGGER trg_touch_%I BEFORE UPDATE ON %I
       FOR EACH ROW EXECUTE FUNCTION touch_row()',
      t.table_name, t.table_name);
  END LOOP;
END $$;

-- ============================================================================
-- ROW-LEVEL SECURITY: every table with org_id gets tenant isolation via the
-- app.org_id GUC (set per-connection by the API layer). companies (global
-- network) intentionally excluded; app layer governs profile visibility.
-- ============================================================================
DO $$
DECLARE t record;
BEGIN
  FOR t IN
    SELECT DISTINCT table_name
    FROM information_schema.columns
    WHERE table_schema = 'public' AND column_name = 'org_id'
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t.table_name);
    EXECUTE format(
      'CREATE POLICY tenant_isolation_%I ON %I
       USING (org_id = current_setting(''app.org_id'', true)::uuid)',
      t.table_name, t.table_name);
  END LOOP;
END $$;

-- ============================================================================
-- HOT-PATH INDEXES (beyond PK/unique). Soft-delete partial indexes keep the
-- common "current rows" queries tight.
-- ============================================================================
CREATE INDEX idx_projects_org ON projects (org_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_documents_project ON documents (project_id, category) WHERE deleted_at IS NULL;
CREATE INDEX idx_chunks_embedding ON document_chunks USING hnsw (embedding vector_cosine_ops);
CREATE INDEX idx_audit_row ON audit_log (table_name, row_id, occurred_at);

-- ============================================================================
-- SEED: units of measure
-- ============================================================================
INSERT INTO units_of_measure (code, name, dimension) VALUES
 ('EA','Each','count'), ('UNIT','Dwelling Unit','count'),
 ('SF','Square Foot','area'), ('SY','Square Yard','area'), ('SQ','Square (100 SF)','area'),
 ('LF','Linear Foot','length'), ('CY','Cubic Yard','volume'),
 ('TON','Ton','weight'), ('LB','Pound','weight'),
 ('HR','Hour','time'), ('DAY','Day','time'), ('MO','Month','time'),
 ('LS','Lump Sum','lump'), ('ALLOW','Allowance','lump'), ('GAL','Gallon','volume');
