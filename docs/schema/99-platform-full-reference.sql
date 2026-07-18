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
-- 02 DIRECTORY & SUBCONTRACTOR CRM
-- Pattern: BuildingConnected's two-sided network (global company profiles,
-- free for subs, discoverable by GCs) + each org's PRIVATE overlay
-- (relationship, notes, scorecards). TradeTapp-style prequal with computed
-- limits. Certification + COI tracking wired directly into payment holds.
-- ============================================================================

-- GLOBAL network profile: one row per real-world company, shared across
-- tenants (no org_id). Subs maintain their own profile once; every GC on the
-- platform benefits. This is the network-effect table.
CREATE TABLE companies (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name          text NOT NULL,
  dba           text,
  ein_hash      text,                       -- hashed for dedupe, never raw
  website       text,
  address_line1 text, city text, state char(2), zip text,
  year_founded  integer,
  employee_count_range text,                -- '1-10','11-50',...
  annual_revenue_range text,
  union_status  text,                       -- union | open_shop | mixed
  claimed_by_org_id uuid REFERENCES organizations(id),  -- sub claimed profile
  profile_completeness numeric(5,4) NOT NULL DEFAULT 0,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  revision      bigint NOT NULL DEFAULT 1,
  deleted_at    timestamptz
);
CREATE INDEX idx_companies_name_trgm ON companies USING gin (name gin_trgm_ops);

CREATE TABLE company_trades (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id    uuid NOT NULL REFERENCES companies(id),
  csi_division  text NOT NULL,              -- '09' Finishes
  csi_section   text,                       -- '09 29 00' Gypsum Board
  is_primary    boolean NOT NULL DEFAULT false,
  UNIQUE (company_id, csi_division, csi_section)
);

CREATE TABLE company_service_areas (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id    uuid NOT NULL REFERENCES companies(id),
  state         char(2) NOT NULL,
  msa_code      text,                       -- null = statewide
  radius_miles  integer,
  UNIQUE (company_id, state, msa_code)
);

-- Diversity/eligibility certifications with expirations. Drives participation
-- tracking, good-faith-effort reporting, and expiry alerts. No competitor
-- treats these as first-class; for public work they gate payment.
CREATE TABLE business_certifications (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id    uuid NOT NULL REFERENCES companies(id),
  program       cert_program NOT NULL,
  issuing_agency text NOT NULL,             -- 'City of Milwaukee', 'WisDOT UCP'
  certificate_number text,
  effective_date date,
  expiration_date date,
  document_id   uuid REFERENCES documents(id),
  verified_at   timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  revision      bigint NOT NULL DEFAULT 1,
  deleted_at    timestamptz
);
CREATE INDEX idx_certs_expiry ON business_certifications (expiration_date)
  WHERE deleted_at IS NULL;

-- PRIVATE overlay: this org's relationship with a company. CRM home base.
CREATE TABLE vendor_records (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id        uuid NOT NULL REFERENCES organizations(id),
  company_id    uuid NOT NULL REFERENCES companies(id),
  vendor_no     text,                       -- accounting vendor number (QBO map)
  relationship  text NOT NULL DEFAULT 'prospect', -- prospect|active|preferred|do_not_use
  internal_notes text,
  default_payment_terms text,               -- 'net30_paid_when_paid'
  qbo_vendor_ref text,                      -- QuickBooks Online sync key
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  revision      bigint NOT NULL DEFAULT 1,
  deleted_at    timestamptz,
  UNIQUE (org_id, company_id)
);

CREATE TABLE vendor_contacts (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id        uuid NOT NULL REFERENCES organizations(id),
  company_id    uuid NOT NULL REFERENCES companies(id),
  full_name     text NOT NULL,
  title         text,
  email         text,
  phone         text,
  role_tags     text[],                     -- {estimating, billing, field}
  is_bid_recipient boolean NOT NULL DEFAULT true,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  revision      bigint NOT NULL DEFAULT 1,
  deleted_at    timestamptz
);

-- Prequalification submissions (TradeTapp pattern: questionnaire + computed
-- limits + financial ratios). One row per prequal cycle; latest wins.
CREATE TABLE vendor_qualifications (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id        uuid NOT NULL REFERENCES organizations(id),
  company_id    uuid NOT NULL REFERENCES companies(id),
  submitted_at  timestamptz NOT NULL DEFAULT now(),
  expires_at    date,
  emr           numeric(6,3),               -- experience modification rate
  bonding_single_limit numeric(15,2),
  bonding_aggregate_limit numeric(15,2),
  surety_name   text,
  largest_completed_contract numeric(15,2),
  financials    jsonb NOT NULL DEFAULT '{}',-- revenue, working capital, ratios
  references_checked boolean NOT NULL DEFAULT false,
  questionnaire jsonb NOT NULL DEFAULT '{}',
  -- Computed by scoring service; stored for point-in-time record
  computed_single_project_limit numeric(15,2),
  computed_aggregate_limit numeric(15,2),
  risk_score    numeric(5,2),               -- 0-100
  status        text NOT NULL DEFAULT 'pending', -- pending|qualified|conditional|declined
  reviewed_by   uuid REFERENCES users(id),
  document_id   uuid REFERENCES documents(id),
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  revision      bigint NOT NULL DEFAULT 1,
  deleted_at    timestamptz
);

-- Insurance: certificate + coverage lines. Compliance status is COMPUTED and
-- enforced by payment_holds (closes the Levelset/GCPay "payment hold gap" —
-- their most-cited weakness: tracking without enforcement).
CREATE TABLE insurance_certificates (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id        uuid NOT NULL REFERENCES organizations(id),
  company_id    uuid NOT NULL REFERENCES companies(id),
  project_id    uuid REFERENCES projects(id),   -- null = master/blanket COI
  producer      text,                            -- insurance agency
  document_id   uuid REFERENCES documents(id),
  additional_insured boolean NOT NULL DEFAULT false,
  waiver_of_subrogation boolean NOT NULL DEFAULT false,
  primary_noncontributory boolean NOT NULL DEFAULT false,
  ai_extracted  boolean NOT NULL DEFAULT false,  -- COI parsed by AI, verified
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  revision      bigint NOT NULL DEFAULT 1,
  deleted_at    timestamptz
);

CREATE TABLE insurance_coverages (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id        uuid NOT NULL REFERENCES organizations(id),
  certificate_id uuid NOT NULL REFERENCES insurance_certificates(id),
  coverage_type text NOT NULL,              -- gl | wc | auto | umbrella | professional | pollution
  each_occurrence numeric(15,2),
  aggregate     numeric(15,2),
  effective_date date NOT NULL,
  expiration_date date NOT NULL,
  policy_number text,
  carrier       text,
  am_best_rating text
);
CREATE INDEX idx_coverage_expiry ON insurance_coverages (expiration_date);

-- Per-project insurance/compliance requirements (what the contract demands),
-- evaluated against coverages to produce holds.
CREATE TABLE compliance_requirements (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id        uuid NOT NULL REFERENCES organizations(id),
  project_id    uuid REFERENCES projects(id),   -- null = org default
  requirement_type text NOT NULL,           -- gl_each_occurrence | wc | lien_waiver | certified_payroll | w9 | license
  min_amount    numeric(15,2),
  is_blocking   boolean NOT NULL DEFAULT true,  -- true => generates payment hold
  notes         text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  revision      bigint NOT NULL DEFAULT 1,
  deleted_at    timestamptz
);

-- Performance scorecards: COMPUTED from platform behavior (bids, punch,
-- change orders, safety). Institutional memory that survives turnover.
-- Recomputed nightly; stored for trend history.
CREATE TABLE vendor_scorecards (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id        uuid NOT NULL REFERENCES organizations(id),
  company_id    uuid NOT NULL REFERENCES companies(id),
  as_of         date NOT NULL,
  bid_invites   integer NOT NULL DEFAULT 0,
  bid_responses integer NOT NULL DEFAULT 0,
  bids_won      integer NOT NULL DEFAULT 0,
  avg_bid_vs_award_pct numeric(9,4),        -- pricing competitiveness
  change_order_rate numeric(9,4),           -- CO $ / contract $
  avg_punch_close_days numeric(7,2),
  on_time_completion_rate numeric(5,4),
  backcharge_count integer NOT NULL DEFAULT 0,
  safety_incident_count integer NOT NULL DEFAULT 0,
  composite_score numeric(5,2),
  created_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (org_id, company_id, as_of)
);

-- Outreach log: every solicitation touch. Doubles as the evidence base for
-- good-faith-effort reports on public work (auto-generated, not hand-built).
CREATE TABLE outreach_events (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id        uuid NOT NULL REFERENCES organizations(id),
  project_id    uuid REFERENCES projects(id),
  company_id    uuid NOT NULL REFERENCES companies(id),
  contact_id    uuid REFERENCES vendor_contacts(id),
  channel       text NOT NULL,              -- itb | email | phone | event | site_walk
  direction     text NOT NULL DEFAULT 'outbound',
  subject       text,
  notes         text,
  bid_invitation_id uuid,                   -- FK added in 08
  occurred_at   timestamptz NOT NULL DEFAULT now(),
  logged_by     uuid REFERENCES users(id),
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  revision      bigint NOT NULL DEFAULT 1,
  deleted_at    timestamptz
);

ALTER TABLE project_members
  ADD CONSTRAINT fk_project_members_company
  FOREIGN KEY (company_id) REFERENCES companies(id);
-- ============================================================================
-- 03 COST STRUCTURE, CONTRACTS, BUDGET, CHANGE MANAGEMENT
-- Key departures from Procore:
--   * Change Event -> PCO -> CCO collapsed into ONE change_orders object with
--     states + links (their #1 financial UX complaint).
--   * SOV lines are VERSIONED, never hard-locked (fixes "can't edit SOV after
--     invoice" and "cascading change order re-edits").
--   * funding_sources is LIHTC-aware: budget lines allocate across sources
--     with eligible-basis tagging. Procore cannot represent this at all.
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
-- PRIME CONTRACT (owner side)
-- ----------------------------------------------------------------------------
CREATE TABLE prime_contracts (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id        uuid NOT NULL REFERENCES organizations(id),
  project_id    uuid NOT NULL REFERENCES projects(id),
  owner_company_id uuid REFERENCES companies(id),
  contract_no   text,
  title         text NOT NULL,
  contract_type text NOT NULL DEFAULT 'gmp',    -- gmp | lump_sum | cost_plus | cmar
  original_amount numeric(15,2) NOT NULL DEFAULT 0,
  retainage_pct numeric(9,4) NOT NULL DEFAULT 0.10,
  executed_on   date,
  status        commitment_status NOT NULL DEFAULT 'draft',
  document_id   uuid REFERENCES documents(id),
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  revision      bigint NOT NULL DEFAULT 1,
  deleted_at    timestamptz
);

-- Prime SOV: the G703 backbone. Versioned same as commitment SOV.
CREATE TABLE prime_sov_lines (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id        uuid NOT NULL REFERENCES organizations(id),
  prime_contract_id uuid NOT NULL REFERENCES prime_contracts(id),
  line_no       integer NOT NULL,
  version_no    integer NOT NULL DEFAULT 1,
  is_current    boolean NOT NULL DEFAULT true,
  superseded_by uuid REFERENCES prime_sov_lines(id),
  cost_code_id  uuid REFERENCES cost_codes(id),
  description   text NOT NULL,
  scheduled_value numeric(15,2) NOT NULL DEFAULT 0,
  retainage_pct numeric(9,4),               -- null = contract default
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  revision      bigint NOT NULL DEFAULT 1,
  deleted_at    timestamptz
);

-- ----------------------------------------------------------------------------
-- FUNDING SOURCES (LIHTC-aware capital stack — the moat Procore lacks)
-- ----------------------------------------------------------------------------
CREATE TABLE funding_sources (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id        uuid NOT NULL REFERENCES organizations(id),
  project_id    uuid NOT NULL REFERENCES projects(id),
  name          text NOT NULL,              -- 'US Bank Construction Loan'
  source_kind   text NOT NULL,              -- construction_loan | lihtc_equity | soft_loan | grant | deferred_fee | owner_equity
  lender_agency_company_id uuid REFERENCES companies(id),
  committed_amount numeric(15,2) NOT NULL DEFAULT 0,
  draw_order    integer,                    -- pari passu handled at draw level
  requires_draw_package boolean NOT NULL DEFAULT true,
  requirements  jsonb NOT NULL DEFAULT '{}',-- per-lender checklist config
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  revision      bigint NOT NULL DEFAULT 1,
  deleted_at    timestamptz
);

-- ----------------------------------------------------------------------------
-- BUDGET
-- ----------------------------------------------------------------------------
CREATE TABLE budgets (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id        uuid NOT NULL REFERENCES organizations(id),
  project_id    uuid NOT NULL REFERENCES projects(id) UNIQUE,
  status        text NOT NULL DEFAULT 'active',   -- active | locked_baseline
  baseline_locked_at timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  revision      bigint NOT NULL DEFAULT 1,
  deleted_at    timestamptz
);

-- WBS = cost_code x cost_type. Committed/actuals/projected are COMPUTED from
-- commitments, change orders, and invoices — never hand-plugged (no silent
-- gap-filling; variances must surface).
CREATE TABLE budget_lines (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id        uuid NOT NULL REFERENCES organizations(id),
  budget_id     uuid NOT NULL REFERENCES budgets(id),
  cost_code_id  uuid NOT NULL REFERENCES cost_codes(id),
  cost_kind     cost_type NOT NULL DEFAULT 'subcontract',
  description   text,
  original_amount numeric(15,2) NOT NULL DEFAULT 0,
  is_eligible_basis boolean,                -- LIHTC eligible basis tag
  is_hard_cost  boolean NOT NULL DEFAULT true,
  source_estimate_line_id uuid,             -- FK added in 07 (estimate handoff)
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  revision      bigint NOT NULL DEFAULT 1,
  deleted_at    timestamptz,
  UNIQUE (budget_id, cost_code_id, cost_kind)
);

-- Budget transfers between lines: explicit, audited, net-zero enforced at app
-- layer with a ledger here.
CREATE TABLE budget_modifications (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id        uuid NOT NULL REFERENCES organizations(id),
  budget_id     uuid NOT NULL REFERENCES budgets(id),
  from_line_id  uuid REFERENCES budget_lines(id),
  to_line_id    uuid REFERENCES budget_lines(id),
  amount        numeric(15,2) NOT NULL CHECK (amount > 0),
  reason        text NOT NULL,
  approved_by   uuid REFERENCES users(id),
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  revision      bigint NOT NULL DEFAULT 1,
  deleted_at    timestamptz
);

-- Budget line <-> funding source allocation (drives draw splits + basis calc)
CREATE TABLE funding_allocations (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id        uuid NOT NULL REFERENCES organizations(id),
  budget_line_id uuid NOT NULL REFERENCES budget_lines(id),
  funding_source_id uuid NOT NULL REFERENCES funding_sources(id),
  allocation_pct numeric(9,6),              -- either pct or fixed amount
  allocation_amount numeric(15,2),
  UNIQUE (budget_line_id, funding_source_id)
);

-- Period-end snapshot (immutable): anchors variance reporting + benchmarking
CREATE TABLE budget_snapshots (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id        uuid NOT NULL REFERENCES organizations(id),
  budget_id     uuid NOT NULL REFERENCES budgets(id),
  as_of         date NOT NULL,
  lines         jsonb NOT NULL,             -- frozen computed rollup per line
  created_by    uuid REFERENCES users(id),
  created_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (budget_id, as_of)
);

-- ----------------------------------------------------------------------------
-- COMMITMENTS (subcontracts + POs)
-- ----------------------------------------------------------------------------
CREATE TABLE commitments (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id        uuid NOT NULL REFERENCES organizations(id),
  project_id    uuid NOT NULL REFERENCES projects(id),
  company_id    uuid NOT NULL REFERENCES companies(id),
  kind          commitment_type NOT NULL DEFAULT 'subcontract',
  number        text NOT NULL,              -- 'SC-09-001'
  title         text NOT NULL,
  status        commitment_status NOT NULL DEFAULT 'draft',
  original_amount numeric(15,2) NOT NULL DEFAULT 0,
  retainage_pct numeric(9,4) NOT NULL DEFAULT 0.10,
  executed_on   date,
  source_bid_id uuid,                       -- FK added in 08 (buyout provenance)
  inclusions    text,
  exclusions    text,
  payment_terms text,
  document_id   uuid REFERENCES documents(id),
  qbo_ref       text,                       -- QuickBooks sync key
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  revision      bigint NOT NULL DEFAULT 1,
  deleted_at    timestamptz,
  UNIQUE (project_id, number)
);

-- VERSIONED SOV lines. Editing after an invoice creates version N+1 with a
-- full audit trail; prior invoices keep pointing at the version they billed
-- against. Kills Procore's locked-line/cascade problem cleanly.
CREATE TABLE commitment_sov_lines (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id        uuid NOT NULL REFERENCES organizations(id),
  commitment_id uuid NOT NULL REFERENCES commitments(id),
  line_no       integer NOT NULL,
  version_no    integer NOT NULL DEFAULT 1,
  is_current    boolean NOT NULL DEFAULT true,
  superseded_by uuid REFERENCES commitment_sov_lines(id),
  cost_code_id  uuid REFERENCES cost_codes(id),
  budget_line_id uuid REFERENCES budget_lines(id),
  description   text NOT NULL,
  scheduled_value numeric(15,2) NOT NULL DEFAULT 0,
  retainage_pct numeric(9,4),
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  revision      bigint NOT NULL DEFAULT 1,
  deleted_at    timestamptz
);
CREATE INDEX idx_sov_current ON commitment_sov_lines (commitment_id)
  WHERE is_current AND deleted_at IS NULL;

-- ----------------------------------------------------------------------------
-- CHANGE MANAGEMENT — ONE OBJECT
-- A change_order has a scope (prime|commitment|budget_only) and a state
-- machine. Prime and commitment changes arising from the same event are tied
-- by change_order_links, replacing Procore's Change Event/PCO/CCO trio.
-- ----------------------------------------------------------------------------
CREATE TABLE change_orders (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id        uuid NOT NULL REFERENCES organizations(id),
  project_id    uuid NOT NULL REFERENCES projects(id),
  scope         change_scope NOT NULL,
  number        text NOT NULL,              -- 'PCO-014' / 'CCO-09-003'
  title         text NOT NULL,
  reason        change_reason NOT NULL DEFAULT 'field_condition',
  status        change_status NOT NULL DEFAULT 'draft',
  prime_contract_id uuid REFERENCES prime_contracts(id),
  commitment_id uuid REFERENCES commitments(id),
  amount        numeric(15,2) NOT NULL DEFAULT 0,   -- rollup of lines
  schedule_impact_days integer NOT NULL DEFAULT 0,
  originating_rfi_id uuid,                  -- FK added in 06
  submitted_at  timestamptz,
  approved_at   timestamptz,
  approved_by   uuid REFERENCES users(id),
  document_id   uuid REFERENCES documents(id),
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  revision      bigint NOT NULL DEFAULT 1,
  deleted_at    timestamptz,
  UNIQUE (project_id, scope, number),
  CHECK (
    (scope = 'prime' AND prime_contract_id IS NOT NULL) OR
    (scope = 'commitment' AND commitment_id IS NOT NULL) OR
    (scope = 'budget_only')
  )
);

CREATE TABLE change_order_lines (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id        uuid NOT NULL REFERENCES organizations(id),
  change_order_id uuid NOT NULL REFERENCES change_orders(id),
  cost_code_id  uuid REFERENCES cost_codes(id),
  budget_line_id uuid REFERENCES budget_lines(id),
  description   text NOT NULL,
  quantity      numeric(15,4),
  uom           text REFERENCES units_of_measure(code),
  unit_cost     numeric(15,4),
  amount        numeric(15,2) NOT NULL DEFAULT 0,
  -- Approved commitment CO lines append a new SOV version line automatically:
  resulting_sov_line_id uuid REFERENCES commitment_sov_lines(id),
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  revision      bigint NOT NULL DEFAULT 1,
  deleted_at    timestamptz
);

-- Ties owner-side and sub-side changes from the same event (markup analysis:
-- prime CO $ vs sum of linked commitment CO $ = GC margin on change work).
CREATE TABLE change_order_links (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id        uuid NOT NULL REFERENCES organizations(id),
  prime_change_order_id uuid NOT NULL REFERENCES change_orders(id),
  commitment_change_order_id uuid NOT NULL REFERENCES change_orders(id),
  UNIQUE (prime_change_order_id, commitment_change_order_id)
);
-- ============================================================================
-- 04 BILLING, PAYMENTS, LIEN WAIVERS, PAYMENT HOLDS, DRAW COMMAND CENTER
-- Patterns adopted:
--   * Siteline: billing periods with automatic carry-forward; a sub's pay app
--     is generated from prior-period state, not re-keyed.
--   * GCPay: pay app <-> waiver exchange coupled in one flow; waiver held in
--     escrow until payment releases.
--   * Levelset: state-statutory waiver template library (50 states).
--   * FIX for the market's biggest gap: payment_holds ENFORCE compliance —
--     a payment cannot move to processing with an open blocking hold.
--   * Rabbet-inspired: draw_packages as first-class lender deliverables with
--     per-source funding splits and AI-checked document checklists.
-- ============================================================================

CREATE TABLE billing_periods (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id        uuid NOT NULL REFERENCES organizations(id),
  project_id    uuid NOT NULL REFERENCES projects(id),
  period_no     integer NOT NULL,
  period_start  date NOT NULL,
  period_end    date NOT NULL,
  sub_billing_due date,                     -- when subs must submit
  status        text NOT NULL DEFAULT 'open',   -- open | in_review | closed
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  revision      bigint NOT NULL DEFAULT 1,
  deleted_at    timestamptz,
  UNIQUE (project_id, period_no)
);

-- Sub pay applications (invoices against commitment SOV)
CREATE TABLE sub_invoices (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id        uuid NOT NULL REFERENCES organizations(id),
  project_id    uuid NOT NULL REFERENCES projects(id),
  commitment_id uuid NOT NULL REFERENCES commitments(id),
  billing_period_id uuid NOT NULL REFERENCES billing_periods(id),
  invoice_no    text NOT NULL,
  status        invoice_status NOT NULL DEFAULT 'draft',
  submitted_at  timestamptz,
  approved_at   timestamptz,
  approved_by   uuid REFERENCES users(id),
  -- Rollups (computed from lines; stored for statement rendering)
  work_completed_this_period numeric(15,2) NOT NULL DEFAULT 0,
  stored_materials numeric(15,2) NOT NULL DEFAULT 0,
  retainage_held_this_period numeric(15,2) NOT NULL DEFAULT 0,
  retainage_released numeric(15,2) NOT NULL DEFAULT 0,
  net_due       numeric(15,2) NOT NULL DEFAULT 0,
  ai_reviewed   boolean NOT NULL DEFAULT false,  -- AI gap-check before human
  ai_flags      jsonb NOT NULL DEFAULT '[]',     -- overbilling, math, missing docs
  document_id   uuid REFERENCES documents(id),
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  revision      bigint NOT NULL DEFAULT 1,
  deleted_at    timestamptz,
  UNIQUE (commitment_id, invoice_no)
);

-- Line-level billing with carry-forward. previous_* is copied from the last
-- approved invoice per SOV line at creation (Siteline pattern) — the sub only
-- enters "this period".
CREATE TABLE sub_invoice_lines (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id        uuid NOT NULL REFERENCES organizations(id),
  sub_invoice_id uuid NOT NULL REFERENCES sub_invoices(id),
  sov_line_id   uuid NOT NULL REFERENCES commitment_sov_lines(id), -- version billed against
  previous_completed numeric(15,2) NOT NULL DEFAULT 0,
  this_period   numeric(15,2) NOT NULL DEFAULT 0,
  stored_materials numeric(15,2) NOT NULL DEFAULT 0,
  pct_complete  numeric(9,6),               -- computed; stored for the form
  retainage_held numeric(15,2) NOT NULL DEFAULT 0,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  revision      bigint NOT NULL DEFAULT 1,
  deleted_at    timestamptz
);

-- Owner pay applications (AIA G702/G703 or agency equivalents)
CREATE TABLE owner_pay_applications (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id        uuid NOT NULL REFERENCES organizations(id),
  project_id    uuid NOT NULL REFERENCES projects(id),
  prime_contract_id uuid NOT NULL REFERENCES prime_contracts(id),
  billing_period_id uuid NOT NULL REFERENCES billing_periods(id),
  application_no integer NOT NULL,
  status        pay_app_status NOT NULL DEFAULT 'draft',
  period_to     date NOT NULL,
  original_contract_sum numeric(15,2) NOT NULL DEFAULT 0,
  net_change_orders numeric(15,2) NOT NULL DEFAULT 0,
  contract_sum_to_date numeric(15,2) NOT NULL DEFAULT 0,
  total_completed_stored numeric(15,2) NOT NULL DEFAULT 0,
  retainage     numeric(15,2) NOT NULL DEFAULT 0,
  total_earned_less_retainage numeric(15,2) NOT NULL DEFAULT 0,
  less_previous_certificates numeric(15,2) NOT NULL DEFAULT 0,
  current_payment_due numeric(15,2) NOT NULL DEFAULT 0,
  certified_at  timestamptz,
  architect_company_id uuid REFERENCES companies(id),
  document_id   uuid REFERENCES documents(id),   -- rendered G702 pdf
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  revision      bigint NOT NULL DEFAULT 1,
  deleted_at    timestamptz,
  UNIQUE (prime_contract_id, application_no)
);

CREATE TABLE owner_pay_app_lines (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id        uuid NOT NULL REFERENCES organizations(id),
  owner_pay_application_id uuid NOT NULL REFERENCES owner_pay_applications(id),
  prime_sov_line_id uuid NOT NULL REFERENCES prime_sov_lines(id),
  previous_completed numeric(15,2) NOT NULL DEFAULT 0,
  this_period   numeric(15,2) NOT NULL DEFAULT 0,
  stored_materials numeric(15,2) NOT NULL DEFAULT 0,
  retainage_held numeric(15,2) NOT NULL DEFAULT 0,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  revision      bigint NOT NULL DEFAULT 1,
  deleted_at    timestamptz
);

-- Non-commitment costs (GC labor, materials bought direct, GCs/GRs)
CREATE TABLE direct_costs (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id        uuid NOT NULL REFERENCES organizations(id),
  project_id    uuid NOT NULL REFERENCES projects(id),
  budget_line_id uuid REFERENCES budget_lines(id),
  cost_code_id  uuid REFERENCES cost_codes(id),
  vendor_company_id uuid REFERENCES companies(id),
  description   text NOT NULL,
  amount        numeric(15,2) NOT NULL,
  incurred_on   date NOT NULL,
  document_id   uuid REFERENCES documents(id),  -- receipt/invoice, AI-extracted
  qbo_ref       text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  revision      bigint NOT NULL DEFAULT 1,
  deleted_at    timestamptz
);

-- ----------------------------------------------------------------------------
-- LIEN WAIVERS (Levelset statutory library + GCPay escrow exchange)
-- ----------------------------------------------------------------------------
CREATE TABLE waiver_templates (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id        uuid REFERENCES organizations(id),  -- null = platform statutory
  state         char(2) NOT NULL,
  waiver_kind   waiver_type NOT NULL,
  is_statutory  boolean NOT NULL DEFAULT true,  -- state-mandated form language
  title         text NOT NULL,
  body_template text NOT NULL,              -- merge-field template
  notarization_required boolean NOT NULL DEFAULT false,
  effective_date date,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  revision      bigint NOT NULL DEFAULT 1,
  deleted_at    timestamptz
);

CREATE TABLE lien_waivers (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id        uuid NOT NULL REFERENCES organizations(id),
  project_id    uuid NOT NULL REFERENCES projects(id),
  company_id    uuid NOT NULL REFERENCES companies(id),  -- waiving party
  commitment_id uuid REFERENCES commitments(id),
  sub_invoice_id uuid REFERENCES sub_invoices(id),        -- exchange coupling
  payment_id    uuid,                       -- FK added after payments
  template_id   uuid REFERENCES waiver_templates(id),
  waiver_kind   waiver_type NOT NULL,
  status        waiver_status NOT NULL DEFAULT 'required',
  through_date  date NOT NULL,
  amount        numeric(15,2) NOT NULL DEFAULT 0,
  is_sub_tier   boolean NOT NULL DEFAULT false,  -- 2nd-tier sub/supplier waiver
  parent_company_id uuid REFERENCES companies(id), -- whose sub-tier it is
  signed_document_id uuid REFERENCES documents(id),
  signed_at     timestamptz,
  ai_verified   boolean NOT NULL DEFAULT false,  -- AI checks signed doc matches
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  revision      bigint NOT NULL DEFAULT 1,
  deleted_at    timestamptz
);

-- ----------------------------------------------------------------------------
-- PAYMENTS + ENFORCED HOLDS
-- ----------------------------------------------------------------------------
CREATE TABLE payments (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id        uuid NOT NULL REFERENCES organizations(id),
  project_id    uuid NOT NULL REFERENCES projects(id),
  payee_company_id uuid NOT NULL REFERENCES companies(id),
  sub_invoice_id uuid REFERENCES sub_invoices(id),
  amount        numeric(15,2) NOT NULL,
  method        payment_method NOT NULL DEFAULT 'ach',
  status        payment_status NOT NULL DEFAULT 'scheduled',
  scheduled_for date,
  cleared_at    timestamptz,
  reference_no  text,                       -- check no / ACH trace
  qbo_ref       text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  revision      bigint NOT NULL DEFAULT 1,
  deleted_at    timestamptz
);
ALTER TABLE lien_waivers
  ADD CONSTRAINT fk_waiver_payment FOREIGN KEY (payment_id) REFERENCES payments(id);

-- THE ENFORCEMENT LAYER. Holds are generated by rules (compliance engine) or
-- placed manually. App + DB both refuse to move a payment to 'processing'
-- while a blocking hold is open. This is the gap Levelset/GCPay users complain
-- about ("tracking without enforcement").
CREATE TABLE payment_holds (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id        uuid NOT NULL REFERENCES organizations(id),
  project_id    uuid NOT NULL REFERENCES projects(id),
  payment_id    uuid REFERENCES payments(id),
  company_id    uuid NOT NULL REFERENCES companies(id),
  reason        hold_reason NOT NULL,
  detail        text,
  source_table  text,                       -- lien_waivers | insurance_coverages | certified_payroll_reports
  source_id     uuid,
  is_blocking   boolean NOT NULL DEFAULT true,
  released_at   timestamptz,
  released_by   uuid REFERENCES users(id),
  release_note  text,                       -- override requires written reason
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  revision      bigint NOT NULL DEFAULT 1,
  deleted_at    timestamptz
);
CREATE INDEX idx_holds_open ON payment_holds (payment_id)
  WHERE released_at IS NULL AND is_blocking AND deleted_at IS NULL;

-- Retainage release events (partial/final, per commitment or per line)
CREATE TABLE retainage_releases (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id        uuid NOT NULL REFERENCES organizations(id),
  commitment_id uuid NOT NULL REFERENCES commitments(id),
  sub_invoice_id uuid REFERENCES sub_invoices(id),
  amount        numeric(15,2) NOT NULL,
  reason        text,                       -- substantial_completion | final | reduction_50pct
  approved_by   uuid REFERENCES users(id),
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  revision      bigint NOT NULL DEFAULT 1,
  deleted_at    timestamptz
);

-- ----------------------------------------------------------------------------
-- DRAW COMMAND CENTER (lender/agency packages — the wedge)
-- ----------------------------------------------------------------------------
CREATE TABLE draw_packages (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id        uuid NOT NULL REFERENCES organizations(id),
  project_id    uuid NOT NULL REFERENCES projects(id),
  billing_period_id uuid REFERENCES billing_periods(id),
  draw_no       integer NOT NULL,
  status        draw_status NOT NULL DEFAULT 'assembling',
  requested_amount numeric(15,2) NOT NULL DEFAULT 0,
  approved_amount numeric(15,2),
  submitted_at  timestamptz,
  funded_at     timestamptz,
  inspection_report_document_id uuid REFERENCES documents(id),
  title_update_document_id uuid REFERENCES documents(id),
  package_document_id uuid REFERENCES documents(id),  -- assembled PDF
  ai_completeness_score numeric(5,4),       -- checklist coverage pre-submit
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  revision      bigint NOT NULL DEFAULT 1,
  deleted_at    timestamptz,
  UNIQUE (project_id, draw_no)
);

-- Per-funding-source split of a draw (multi-source LIHTC stacks draw pro rata
-- or by order; both representable).
CREATE TABLE draw_funding_lines (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id        uuid NOT NULL REFERENCES organizations(id),
  draw_package_id uuid NOT NULL REFERENCES draw_packages(id),
  funding_source_id uuid NOT NULL REFERENCES funding_sources(id),
  amount        numeric(15,2) NOT NULL DEFAULT 0,
  UNIQUE (draw_package_id, funding_source_id)
);

-- Configurable checklist per lender (from funding_sources.requirements),
-- instantiated per draw; AI validates each item against attached documents.
CREATE TABLE draw_checklist_items (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id        uuid NOT NULL REFERENCES organizations(id),
  draw_package_id uuid NOT NULL REFERENCES draw_packages(id),
  item_key      text NOT NULL,              -- g702 | g703 | waivers_prior | coi | payroll | photos | soft_cost_invoices
  title         text NOT NULL,
  is_required   boolean NOT NULL DEFAULT true,
  satisfied     boolean NOT NULL DEFAULT false,
  document_id   uuid REFERENCES documents(id),
  ai_note       text,                       -- why AI thinks it fails/passes
  verified_by   uuid REFERENCES users(id),
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  revision      bigint NOT NULL DEFAULT 1,
  deleted_at    timestamptz
);
-- ============================================================================
-- 05 COMPLIANCE ENGINE (Davis-Bacon / Section 3 / MBE participation)
-- The whitespace: no incumbent treats public-funding compliance as a native
-- domain. Design goal: compliance artifacts are GENERATED from operating data
-- (payroll lines, commitments, outreach events) — never assembled by hand.
-- ============================================================================

-- Wage determinations (DOL or state) attached to a project; classifications
-- carry base + fringe. Seeded by AI extraction from the WD document.
CREATE TABLE wage_determinations (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id        uuid NOT NULL REFERENCES organizations(id),
  project_id    uuid NOT NULL REFERENCES projects(id),
  wd_number     text NOT NULL,              -- 'WI20260015'
  modification_no integer NOT NULL DEFAULT 0,
  published_on  date,
  county        text,
  construction_kind text,                   -- building | residential | heavy | highway
  document_id   uuid REFERENCES documents(id),
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  revision      bigint NOT NULL DEFAULT 1,
  deleted_at    timestamptz
);

CREATE TABLE wage_classifications (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id        uuid NOT NULL REFERENCES organizations(id),
  wage_determination_id uuid NOT NULL REFERENCES wage_determinations(id),
  classification text NOT NULL,             -- 'Carpenter', 'Laborer Group 1'
  base_rate     numeric(10,4) NOT NULL,
  fringe_rate   numeric(10,4) NOT NULL DEFAULT 0,
  UNIQUE (wage_determination_id, classification)
);

-- Workers (minimal PII; owned by the employing company — GC self-perform or
-- sub). SSN never stored raw; last4 for WH-347 identifiers.
CREATE TABLE workers (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id        uuid NOT NULL REFERENCES organizations(id),
  employer_company_id uuid NOT NULL REFERENCES companies(id),
  full_name     text NOT NULL,
  ssn_last4     char(4),
  address_city  text, address_state char(2), address_zip text,
  is_section3_worker boolean NOT NULL DEFAULT false,
  is_targeted_section3_worker boolean NOT NULL DEFAULT false,
  section3_eligibility_basis text,          -- low_income_resident | yhb_participant | ...
  section3_certified_on date,
  apprentice_program text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  revision      bigint NOT NULL DEFAULT 1,
  deleted_at    timestamptz
);

-- Certified payroll (WH-347). One report = one employer + one week. Subs
-- submit through their portal; AI parses uploaded payroll registers into
-- lines; the platform renders the compliant WH-347 + Statement of Compliance.
CREATE TABLE certified_payroll_reports (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id        uuid NOT NULL REFERENCES organizations(id),
  project_id    uuid NOT NULL REFERENCES projects(id),
  employer_company_id uuid NOT NULL REFERENCES companies(id),
  commitment_id uuid REFERENCES commitments(id),
  payroll_no    integer NOT NULL,
  week_ending   date NOT NULL,
  is_final      boolean NOT NULL DEFAULT false,
  is_no_work    boolean NOT NULL DEFAULT false,
  status        text NOT NULL DEFAULT 'draft',  -- draft|submitted|accepted|deficient
  deficiency_notes text,
  statement_signed_by text,
  statement_signed_at timestamptz,
  document_id   uuid REFERENCES documents(id),  -- rendered WH-347
  source_document_id uuid REFERENCES documents(id), -- raw payroll upload
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  revision      bigint NOT NULL DEFAULT 1,
  deleted_at    timestamptz,
  UNIQUE (project_id, employer_company_id, week_ending)
);

CREATE TABLE certified_payroll_lines (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id        uuid NOT NULL REFERENCES organizations(id),
  report_id     uuid NOT NULL REFERENCES certified_payroll_reports(id),
  worker_id     uuid NOT NULL REFERENCES workers(id),
  classification_id uuid REFERENCES wage_classifications(id),
  work_classification text NOT NULL,
  hours_by_day  jsonb NOT NULL DEFAULT '{}',   -- {"mon":8,"tue":8,...} ST+OT split
  total_st_hours numeric(7,2) NOT NULL DEFAULT 0,
  total_ot_hours numeric(7,2) NOT NULL DEFAULT 0,
  rate_of_pay   numeric(10,4) NOT NULL,
  fringe_paid_cash numeric(10,4) NOT NULL DEFAULT 0,
  fringe_paid_plan numeric(10,4) NOT NULL DEFAULT 0,
  gross_earned  numeric(12,2) NOT NULL DEFAULT 0,
  deductions    jsonb NOT NULL DEFAULT '{}',
  net_paid      numeric(12,2) NOT NULL DEFAULT 0,
  -- Underpayment engine: computed vs wage determination, flagged pre-submit
  compliant     boolean,
  compliance_note text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  revision      bigint NOT NULL DEFAULT 1,
  deleted_at    timestamptz
);

-- Section 3 labor-hour ledger (24 CFR Part 75 benchmarks: total labor hours,
-- section 3 worker hours, targeted section 3 worker hours). Derived from
-- certified payroll lines where possible; direct entry allowed for non-DB jobs.
CREATE TABLE labor_hour_entries (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id        uuid NOT NULL REFERENCES organizations(id),
  project_id    uuid NOT NULL REFERENCES projects(id),
  employer_company_id uuid NOT NULL REFERENCES companies(id),
  worker_id     uuid REFERENCES workers(id),
  payroll_line_id uuid REFERENCES certified_payroll_lines(id),
  period_end    date NOT NULL,
  total_hours   numeric(9,2) NOT NULL DEFAULT 0,
  section3_hours numeric(9,2) NOT NULL DEFAULT 0,
  targeted_section3_hours numeric(9,2) NOT NULL DEFAULT 0,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  revision      bigint NOT NULL DEFAULT 1,
  deleted_at    timestamptz
);

-- Participation goals per project (MBE %, WBE %, Section 3 hour benchmarks,
-- local hire). Actuals are computed from commitments + payments to certified
-- vendors and from labor_hour_entries; snapshots stored for agency reporting.
CREATE TABLE participation_goals (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id        uuid NOT NULL REFERENCES organizations(id),
  project_id    uuid NOT NULL REFERENCES projects(id),
  program       cert_program NOT NULL,
  basis         text NOT NULL DEFAULT 'contract_value', -- contract_value | labor_hours
  goal_pct      numeric(9,6) NOT NULL,
  set_by_agency text,                       -- 'City of Milwaukee RPP'
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  revision      bigint NOT NULL DEFAULT 1,
  deleted_at    timestamptz,
  UNIQUE (project_id, program, basis)
);

CREATE TABLE participation_snapshots (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id        uuid NOT NULL REFERENCES organizations(id),
  project_id    uuid NOT NULL REFERENCES projects(id),
  program       cert_program NOT NULL,
  as_of         date NOT NULL,
  committed_amount numeric(15,2) NOT NULL DEFAULT 0,   -- to certified vendors
  paid_amount   numeric(15,2) NOT NULL DEFAULT 0,
  total_committed numeric(15,2) NOT NULL DEFAULT 0,    -- denominator
  achieved_pct  numeric(9,6),
  detail        jsonb NOT NULL DEFAULT '{}',           -- per-vendor breakdown
  created_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (project_id, program, as_of)
);

-- Generated compliance exports (HUD 2516, SPEARS/Section 3, agency formats).
-- Every export is reproducible: stores the query window + rendered document.
CREATE TABLE compliance_exports (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id        uuid NOT NULL REFERENCES organizations(id),
  project_id    uuid NOT NULL REFERENCES projects(id),
  export_kind   text NOT NULL,              -- wh347_batch | hud_2516 | section3_report | gfe_report | participation_report
  period_start  date,
  period_end    date,
  document_id   uuid REFERENCES documents(id),
  generated_by  uuid REFERENCES users(id),
  parameters    jsonb NOT NULL DEFAULT '{}',
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  revision      bigint NOT NULL DEFAULT 1,
  deleted_at    timestamptz
);
-- ============================================================================
-- 06 PROJECT RECORD (drawings, specs, RFIs, submittals, field)
-- Procore's crown jewels rebuilt with: consistent object shape everywhere,
-- ball-in-court as an explicit reusable pattern, AI drafting on every object,
-- and offline-first identifiers throughout.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- DRAWINGS: set -> sheet -> revision (current pointer). AI extracts sheet
-- number/title/discipline on upload; sheets auto-supersede by number match.
-- ----------------------------------------------------------------------------
CREATE TABLE drawing_sets (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id        uuid NOT NULL REFERENCES organizations(id),
  project_id    uuid NOT NULL REFERENCES projects(id),
  name          text NOT NULL,              -- 'IFC Set', 'ASI-004'
  issued_on     date,
  set_kind      text NOT NULL DEFAULT 'issued_for_construction',
  source_document_id uuid REFERENCES documents(id),  -- original multi-page PDF
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  revision      bigint NOT NULL DEFAULT 1,
  deleted_at    timestamptz
);

CREATE TABLE drawing_sheets (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id        uuid NOT NULL REFERENCES organizations(id),
  project_id    uuid NOT NULL REFERENCES projects(id),
  sheet_number  text NOT NULL,              -- 'A-301'
  title         text,
  discipline    text,                       -- architectural | structural | mep | civil
  current_revision_id uuid,                 -- FK below
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  revision      bigint NOT NULL DEFAULT 1,
  deleted_at    timestamptz,
  UNIQUE (project_id, sheet_number)
);

CREATE TABLE sheet_revisions (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id        uuid NOT NULL REFERENCES organizations(id),
  sheet_id      uuid NOT NULL REFERENCES drawing_sheets(id),
  drawing_set_id uuid NOT NULL REFERENCES drawing_sets(id),
  revision_label text,                      -- 'Rev 3', 'ASI-004'
  document_version_id uuid REFERENCES document_versions(id),
  raster_key    text,                       -- pre-rendered tiles for mobile/offline
  ai_extracted_meta jsonb NOT NULL DEFAULT '{}',
  received_on   date,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  revision      bigint NOT NULL DEFAULT 1,
  deleted_at    timestamptz
);
ALTER TABLE drawing_sheets
  ADD CONSTRAINT fk_sheet_current_rev
  FOREIGN KEY (current_revision_id) REFERENCES sheet_revisions(id);

-- Markups live on a revision; any object (RFI, punch, photo) can pin itself.
CREATE TABLE markups (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id        uuid NOT NULL REFERENCES organizations(id),
  sheet_revision_id uuid NOT NULL REFERENCES sheet_revisions(id),
  author_id     uuid REFERENCES users(id),
  geometry      jsonb NOT NULL,             -- shapes/coords, client-rendered
  linked_table  text,                       -- rfis | punch_items | photos | null
  linked_id     uuid,
  is_private    boolean NOT NULL DEFAULT false,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  revision      bigint NOT NULL DEFAULT 1,
  deleted_at    timestamptz
);

CREATE TABLE spec_sections (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id        uuid NOT NULL REFERENCES organizations(id),
  project_id    uuid NOT NULL REFERENCES projects(id),
  section_number text NOT NULL,             -- '09 29 00'
  title         text NOT NULL,
  division      text,
  document_version_id uuid REFERENCES document_versions(id),
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  revision      bigint NOT NULL DEFAULT 1,
  deleted_at    timestamptz,
  UNIQUE (project_id, section_number)
);

-- ----------------------------------------------------------------------------
-- RFIs: single-question object with explicit ball-in-court. AI drafts the
-- question from field notes/photos and suggests answers from specs/drawings
-- (retrieval over document_chunks); official response is always human.
-- ----------------------------------------------------------------------------
CREATE TABLE rfis (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id        uuid NOT NULL REFERENCES organizations(id),
  project_id    uuid NOT NULL REFERENCES projects(id),
  number        integer NOT NULL,
  subject       text NOT NULL,
  question      text NOT NULL,
  suggested_answer text,                    -- proposer's suggestion (speeds A/E)
  status        rfi_status NOT NULL DEFAULT 'draft',
  ball_in_court_user_id uuid REFERENCES users(id),
  ball_in_court_company_id uuid REFERENCES companies(id),
  due_date      date,
  cost_impact   text NOT NULL DEFAULT 'tbd',      -- yes | no | tbd
  schedule_impact text NOT NULL DEFAULT 'tbd',
  drawing_sheet_id uuid REFERENCES drawing_sheets(id),
  spec_section_id uuid REFERENCES spec_sections(id),
  location_id   uuid REFERENCES locations(id),
  official_response text,
  responded_by  uuid REFERENCES users(id),
  responded_at  timestamptz,
  ai_draft_job_id uuid REFERENCES ai_jobs(id),
  created_by    uuid REFERENCES users(id),
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  revision      bigint NOT NULL DEFAULT 1,
  deleted_at    timestamptz,
  UNIQUE (project_id, number)
);
ALTER TABLE change_orders
  ADD CONSTRAINT fk_co_originating_rfi FOREIGN KEY (originating_rfi_id) REFERENCES rfis(id);

-- Threaded discussion on any object (one consistent comment model platform-wide
-- — fixes Procore's per-tool inconsistency complaint)
CREATE TABLE comments (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id        uuid NOT NULL REFERENCES organizations(id),
  project_id    uuid REFERENCES projects(id),
  parent_table  text NOT NULL,              -- rfis | submittals | punch_items | ...
  parent_id     uuid NOT NULL,
  author_id     uuid REFERENCES users(id),
  body          text NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  revision      bigint NOT NULL DEFAULT 1,
  deleted_at    timestamptz
);
CREATE INDEX idx_comments_parent ON comments (parent_table, parent_id);

-- ----------------------------------------------------------------------------
-- SUBMITTALS: item + revisions + sequential/parallel approver steps.
-- AI builds the submittal register from spec sections on day one.
-- ----------------------------------------------------------------------------
CREATE TABLE submittals (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id        uuid NOT NULL REFERENCES organizations(id),
  project_id    uuid NOT NULL REFERENCES projects(id),
  number        text NOT NULL,              -- '09 29 00-001'
  title         text NOT NULL,
  spec_section_id uuid REFERENCES spec_sections(id),
  submittal_kind text NOT NULL DEFAULT 'product_data', -- shop_drawing | product_data | sample | closeout
  status        submittal_status NOT NULL DEFAULT 'draft',
  responsible_company_id uuid REFERENCES companies(id),
  commitment_id uuid REFERENCES commitments(id),
  required_on_site date,                    -- drives lead-time alerts
  lead_time_days integer,
  ai_generated  boolean NOT NULL DEFAULT false, -- register row created by AI
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  revision      bigint NOT NULL DEFAULT 1,
  deleted_at    timestamptz,
  UNIQUE (project_id, number)
);

CREATE TABLE submittal_revisions (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id        uuid NOT NULL REFERENCES organizations(id),
  submittal_id  uuid NOT NULL REFERENCES submittals(id),
  revision_no   integer NOT NULL DEFAULT 0,
  document_id   uuid REFERENCES documents(id),
  disposition   submittal_disposition,
  returned_at   timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  revision      bigint NOT NULL DEFAULT 1,
  deleted_at    timestamptz,
  UNIQUE (submittal_id, revision_no)
);

CREATE TABLE submittal_workflow_steps (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id        uuid NOT NULL REFERENCES organizations(id),
  submittal_revision_id uuid NOT NULL REFERENCES submittal_revisions(id),
  step_no       integer NOT NULL,
  approver_user_id uuid REFERENCES users(id),
  approver_company_id uuid REFERENCES companies(id),
  days_allowed  integer NOT NULL DEFAULT 14,
  sent_at       timestamptz,
  responded_at  timestamptz,
  disposition   submittal_disposition,
  notes         text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  revision      bigint NOT NULL DEFAULT 1,
  deleted_at    timestamptz
);

-- ----------------------------------------------------------------------------
-- FIELD: daily logs (structured sections), photos, punch, tasks
-- ----------------------------------------------------------------------------
CREATE TABLE daily_logs (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id        uuid NOT NULL REFERENCES organizations(id),
  project_id    uuid NOT NULL REFERENCES projects(id),
  log_date      date NOT NULL,
  status        text NOT NULL DEFAULT 'draft',   -- draft | submitted
  weather_auto  jsonb,                      -- fetched: temp hi/lo, precip, wind
  narrative     text,                       -- AI-drafted from entries+photos, human-approved
  ai_draft_job_id uuid REFERENCES ai_jobs(id),
  submitted_by  uuid REFERENCES users(id),
  submitted_at  timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  revision      bigint NOT NULL DEFAULT 1,
  deleted_at    timestamptz,
  UNIQUE (project_id, log_date)
);

CREATE TABLE daily_log_manpower (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id        uuid NOT NULL REFERENCES organizations(id),
  daily_log_id  uuid NOT NULL REFERENCES daily_logs(id),
  company_id    uuid REFERENCES companies(id),
  trade         text,
  headcount     integer NOT NULL DEFAULT 0,
  hours         numeric(7,2),
  work_performed text,
  location_id   uuid REFERENCES locations(id),
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  revision      bigint NOT NULL DEFAULT 1,
  deleted_at    timestamptz
);

CREATE TABLE daily_log_events (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id        uuid NOT NULL REFERENCES organizations(id),
  daily_log_id  uuid NOT NULL REFERENCES daily_logs(id),
  event_kind    text NOT NULL,              -- delivery | equipment | visitor | delay | safety_note | inspection_visit
  detail        jsonb NOT NULL DEFAULT '{}',
  notes         text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  revision      bigint NOT NULL DEFAULT 1,
  deleted_at    timestamptz
);

-- Photos: searchable, not endless-scroll (a named Procore complaint).
-- AI tags + embedding at upload => "show me all balcony rail photos in Bldg A".
CREATE TABLE photos (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id        uuid NOT NULL REFERENCES organizations(id),
  project_id    uuid NOT NULL REFERENCES projects(id),
  document_version_id uuid NOT NULL REFERENCES document_versions(id),
  taken_at      timestamptz,
  taken_by      uuid REFERENCES users(id),
  latitude      numeric(9,6), longitude numeric(9,6),
  location_id   uuid REFERENCES locations(id),
  sheet_revision_id uuid REFERENCES sheet_revisions(id),  -- pinned to plan
  ai_tags       text[] NOT NULL DEFAULT '{}',
  ai_caption    text,
  embedding     vector(1024),
  linked_table  text,                       -- daily_logs | punch_items | rfis
  linked_id     uuid,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  revision      bigint NOT NULL DEFAULT 1,
  deleted_at    timestamptz
);
CREATE INDEX idx_photos_tags ON photos USING gin (ai_tags);

CREATE TABLE punch_items (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id        uuid NOT NULL REFERENCES organizations(id),
  project_id    uuid NOT NULL REFERENCES projects(id),
  number        integer NOT NULL,
  title         text NOT NULL,
  description   text,
  status        punch_status NOT NULL DEFAULT 'open',
  location_id   uuid REFERENCES locations(id),
  responsible_company_id uuid REFERENCES companies(id),
  commitment_id uuid REFERENCES commitments(id),
  trade_cost_code_id uuid REFERENCES cost_codes(id),
  due_date      date,
  is_backcharge boolean NOT NULL DEFAULT false,
  backcharge_amount numeric(15,2),
  closed_at     timestamptz,
  verified_by   uuid REFERENCES users(id),
  created_by    uuid REFERENCES users(id),
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  revision      bigint NOT NULL DEFAULT 1,
  deleted_at    timestamptz,
  UNIQUE (project_id, number)
);

CREATE TABLE tasks (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id        uuid NOT NULL REFERENCES organizations(id),
  project_id    uuid REFERENCES projects(id),
  title         text NOT NULL,
  description   text,
  status        text NOT NULL DEFAULT 'open',    -- open | in_progress | done | cancelled
  assignee_user_id uuid REFERENCES users(id),
  assignee_company_id uuid REFERENCES companies(id),
  due_date      date,
  linked_table  text,
  linked_id     uuid,
  created_by    uuid REFERENCES users(id),
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  revision      bigint NOT NULL DEFAULT 1,
  deleted_at    timestamptz
);

-- Phase-2-ready forms engine (inspections, safety, QC): template + JSONB
-- response. Keeps launch scope tight without a schema migration later.
CREATE TABLE form_templates (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id        uuid REFERENCES organizations(id),  -- null = platform library
  name          text NOT NULL,
  form_kind     text NOT NULL,              -- inspection | safety | qc | custom
  schema        jsonb NOT NULL,             -- field definitions
  version_no    integer NOT NULL DEFAULT 1,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  revision      bigint NOT NULL DEFAULT 1,
  deleted_at    timestamptz
);

CREATE TABLE form_responses (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id        uuid NOT NULL REFERENCES organizations(id),
  project_id    uuid NOT NULL REFERENCES projects(id),
  form_template_id uuid NOT NULL REFERENCES form_templates(id),
  location_id   uuid REFERENCES locations(id),
  responses     jsonb NOT NULL DEFAULT '{}',
  result        text,                       -- pass | fail | na
  performed_by  uuid REFERENCES users(id),
  performed_at  timestamptz NOT NULL DEFAULT now(),
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  revision      bigint NOT NULL DEFAULT 1,
  deleted_at    timestamptz
);
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
  takeoff_measurement_id uuid,              -- FK below (qty provenance)
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
ALTER TABLE budget_lines
  ADD CONSTRAINT fk_budget_source_estimate_line
  FOREIGN KEY (source_estimate_line_id) REFERENCES estimate_lines(id);

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

-- ----------------------------------------------------------------------------
-- TAKEOFF: measurements on drawing sheets. AI proposes; human verifies.
-- Geometry stored as JSONB (points, scale) so the client re-renders overlays.
-- ----------------------------------------------------------------------------
CREATE TABLE takeoffs (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id        uuid NOT NULL REFERENCES organizations(id),
  estimate_id   uuid NOT NULL REFERENCES estimates(id),
  name          text NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  revision      bigint NOT NULL DEFAULT 1,
  deleted_at    timestamptz
);

CREATE TABLE takeoff_measurements (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id        uuid NOT NULL REFERENCES organizations(id),
  takeoff_id    uuid NOT NULL REFERENCES takeoffs(id),
  sheet_revision_id uuid REFERENCES sheet_revisions(id),
  name          text NOT NULL,              -- 'L3 corridor GWB'
  measure_kind  text NOT NULL,              -- count | linear | area | volume
  geometry      jsonb NOT NULL DEFAULT '{}',
  scale         text,                       -- '1/8" = 1''
  quantity      numeric(15,4) NOT NULL DEFAULT 0,
  uom           text REFERENCES units_of_measure(code),
  ai_generated  boolean NOT NULL DEFAULT false,
  ai_confidence numeric(5,4),
  verified_by   uuid REFERENCES users(id),  -- REQUIRED before qty flows to lines
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  revision      bigint NOT NULL DEFAULT 1,
  deleted_at    timestamptz
);
ALTER TABLE estimate_lines
  ADD CONSTRAINT fk_line_takeoff
  FOREIGN KEY (takeoff_measurement_id) REFERENCES takeoff_measurements(id);
-- ============================================================================
-- 08 BID SOLICITATION REPOSITORY
-- BuildingConnected's best-loved mechanics (bid board, ITB state tracking,
-- coverage view, leveling that prevents re-key errors) rebuilt with:
--   * free sub-side access forever (network growth lever),
--   * AI bid extraction + scope-gap leveling,
--   * outreach automatically documented for good-faith-effort reporting,
--   * award -> commitment in one step (bid provenance kept on the contract).
-- ============================================================================

CREATE TABLE bid_packages (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id        uuid NOT NULL REFERENCES organizations(id),
  project_id    uuid NOT NULL REFERENCES projects(id),
  estimate_id   uuid REFERENCES estimates(id),   -- ties buyout to estimate
  number        text NOT NULL,              -- 'BP-09A'
  title         text NOT NULL,              -- 'Drywall & ACT'
  csi_division  text,
  cost_code_id  uuid REFERENCES cost_codes(id),
  status        bid_package_status NOT NULL DEFAULT 'draft',
  bids_due_at   timestamptz,
  job_walk_at   timestamptz,
  rfis_due_at   timestamptz,
  budget_amount numeric(15,2),              -- carried value (leveling anchor)
  scope_narrative text,
  target_coverage integer NOT NULL DEFAULT 3,   -- min bids wanted
  is_public_solicitation boolean NOT NULL DEFAULT false,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  revision      bigint NOT NULL DEFAULT 1,
  deleted_at    timestamptz,
  UNIQUE (project_id, number)
);

-- Scope sheet: line-by-line inclusions/exclusions/alternates. Bids are
-- leveled against these rows — leveling is structured, not freeform.
CREATE TABLE bid_scope_items (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id        uuid NOT NULL REFERENCES organizations(id),
  bid_package_id uuid NOT NULL REFERENCES bid_packages(id),
  sort_order    integer NOT NULL DEFAULT 0,
  description   text NOT NULL,
  inclusion     scope_inclusion NOT NULL DEFAULT 'included',
  quantity      numeric(15,4),
  uom           text REFERENCES units_of_measure(code),
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  revision      bigint NOT NULL DEFAULT 1,
  deleted_at    timestamptz
);

-- Documents shared with bidders (drawing sets, specs, addenda)
CREATE TABLE bid_package_documents (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id        uuid NOT NULL REFERENCES organizations(id),
  bid_package_id uuid NOT NULL REFERENCES bid_packages(id),
  document_id   uuid NOT NULL REFERENCES documents(id),
  label         text,                       -- 'Addendum 2'
  posted_at     timestamptz NOT NULL DEFAULT now(),
  UNIQUE (bid_package_id, document_id)
);

-- ITB with explicit state machine (BuildingConnected's core loop). Every
-- state change is an outreach_event => good-faith-effort evidence for free.
CREATE TABLE bid_invitations (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id        uuid NOT NULL REFERENCES organizations(id),
  bid_package_id uuid NOT NULL REFERENCES bid_packages(id),
  company_id    uuid NOT NULL REFERENCES companies(id),
  contact_id    uuid REFERENCES vendor_contacts(id),
  status        invitation_status NOT NULL DEFAULT 'draft',
  sent_at       timestamptz,
  first_viewed_at timestamptz,
  responded_at  timestamptz,
  decline_reason text,                      -- too_busy | out_of_area | scope_too_large | ...
  reminder_count integer NOT NULL DEFAULT 0,
  last_reminder_at timestamptz,
  is_certified_outreach boolean NOT NULL DEFAULT false, -- counted toward GFE
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  revision      bigint NOT NULL DEFAULT 1,
  deleted_at    timestamptz,
  UNIQUE (bid_package_id, company_id)
);
ALTER TABLE outreach_events
  ADD CONSTRAINT fk_outreach_invitation
  FOREIGN KEY (bid_invitation_id) REFERENCES bid_invitations(id);

-- Planroom access log: who opened which document when. Coverage signal
-- ("6 viewed, 2 bidding") + GFE evidence.
CREATE TABLE planroom_access_log (
  id            bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  org_id        uuid NOT NULL,
  bid_invitation_id uuid NOT NULL REFERENCES bid_invitations(id),
  document_id   uuid REFERENCES documents(id),
  accessed_by_email text,
  accessed_at   timestamptz NOT NULL DEFAULT now()
);

-- ----------------------------------------------------------------------------
-- BIDS
-- ----------------------------------------------------------------------------
CREATE TABLE bids (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id        uuid NOT NULL REFERENCES organizations(id),
  bid_package_id uuid NOT NULL REFERENCES bid_packages(id),
  bid_invitation_id uuid REFERENCES bid_invitations(id),
  company_id    uuid NOT NULL REFERENCES companies(id),
  version_no    integer NOT NULL DEFAULT 1,
  status        bid_status NOT NULL DEFAULT 'draft',
  base_amount   numeric(15,2) NOT NULL DEFAULT 0,
  submitted_at  timestamptz,
  valid_until   date,
  bond_included boolean,
  proposal_document_id uuid REFERENCES documents(id),
  ai_extraction_job_id uuid REFERENCES ai_jobs(id),  -- parsed from PDF proposal
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  revision      bigint NOT NULL DEFAULT 1,
  deleted_at    timestamptz,
  UNIQUE (bid_package_id, company_id, version_no)
);

-- Bid pricing mapped to scope items (structured comparison, no re-keying —
-- the leveling feature BuildingConnected users cite for preventing errors)
CREATE TABLE bid_line_items (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id        uuid NOT NULL REFERENCES organizations(id),
  bid_id        uuid NOT NULL REFERENCES bids(id),
  bid_scope_item_id uuid REFERENCES bid_scope_items(id),
  description   text,                       -- sub's own wording if unmapped
  amount        numeric(15,2),
  is_included   boolean,                    -- null = silent (flagged as gap)
  ai_mapped     boolean NOT NULL DEFAULT false,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  revision      bigint NOT NULL DEFAULT 1,
  deleted_at    timestamptz
);

-- Exclusions/clarifications AI-extracted from proposal text; the raw material
-- for scope-gap detection during leveling.
CREATE TABLE bid_exclusions (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id        uuid NOT NULL REFERENCES organizations(id),
  bid_id        uuid NOT NULL REFERENCES bids(id),
  text          text NOT NULL,
  matched_scope_item_id uuid REFERENCES bid_scope_items(id),
  severity      text NOT NULL DEFAULT 'review',  -- info | review | gap
  ai_extracted  boolean NOT NULL DEFAULT true,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  revision      bigint NOT NULL DEFAULT 1,
  deleted_at    timestamptz
);

CREATE TABLE bid_alternates (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id        uuid NOT NULL REFERENCES organizations(id),
  bid_id        uuid NOT NULL REFERENCES bids(id),
  description   text NOT NULL,
  amount        numeric(15,2) NOT NULL,
  is_add        boolean NOT NULL DEFAULT true,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  revision      bigint NOT NULL DEFAULT 1,
  deleted_at    timestamptz
);

-- Leveling sheet: normalization adjustments (plugs) per bid per scope item so
-- apples-to-apples totals are computed, with the adjustment reasoning kept.
CREATE TABLE bid_leveling_adjustments (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id        uuid NOT NULL REFERENCES organizations(id),
  bid_id        uuid NOT NULL REFERENCES bids(id),
  bid_scope_item_id uuid REFERENCES bid_scope_items(id),
  adjustment    numeric(15,2) NOT NULL,     -- plug value (+ fills gap)
  reason        text NOT NULL,              -- 'excluded scaffolding; plug from Bid B avg'
  proposed_by_ai boolean NOT NULL DEFAULT false,
  approved_by   uuid REFERENCES users(id),
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  revision      bigint NOT NULL DEFAULT 1,
  deleted_at    timestamptz
);

-- Award: bid -> commitment (provenance both directions)
ALTER TABLE commitments
  ADD CONSTRAINT fk_commitment_source_bid FOREIGN KEY (source_bid_id) REFERENCES bids(id);
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
CREATE INDEX idx_photos_embedding ON photos USING hnsw (embedding vector_cosine_ops);
CREATE INDEX idx_commitments_project ON commitments (project_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_change_orders_project ON change_orders (project_id, status) WHERE deleted_at IS NULL;
CREATE INDEX idx_sub_invoices_period ON sub_invoices (billing_period_id, status) WHERE deleted_at IS NULL;
CREATE INDEX idx_waivers_project_status ON lien_waivers (project_id, status) WHERE deleted_at IS NULL;
CREATE INDEX idx_payroll_project_week ON certified_payroll_reports (project_id, week_ending) WHERE deleted_at IS NULL;
CREATE INDEX idx_rfis_ball ON rfis (project_id, status, ball_in_court_user_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_punch_location ON punch_items (project_id, location_id, status) WHERE deleted_at IS NULL;
CREATE INDEX idx_invitations_pkg_status ON bid_invitations (bid_package_id, status) WHERE deleted_at IS NULL;
CREATE INDEX idx_audit_row ON audit_log (table_name, row_id, occurred_at);
CREATE INDEX idx_vendor_records_org ON vendor_records (org_id, relationship) WHERE deleted_at IS NULL;

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
