-- ============================================================================
-- 020 LEAD PIPELINE (GC_intersection, Gap 2)
-- A lead is more than a submission status. intake_submissions.status tracks
-- ingestion (submitted/converted/spam/discarded); the GC needs a SALES
-- pipeline on top: where is this lead in my week? Additive — new enum, one
-- nullable column, one notes table. Runs after existing migrations.
-- ============================================================================

CREATE TYPE lead_stage AS ENUM ('new','contacted','quoted','won','lost');

-- pipeline_stage is distinct from intake_submissions.status (ingestion) and
-- from proposal status (that specific bid). It is the GC's view of the lead.
ALTER TABLE intake_submissions
  ADD COLUMN pipeline_stage lead_stage NOT NULL DEFAULT 'new',
  ADD COLUMN pipeline_updated_at timestamptz;

CREATE INDEX idx_intake_pipeline ON intake_submissions (org_id, pipeline_stage)
  WHERE deleted_at IS NULL;

-- Free-text notes the GC keeps on a lead. Append-only history, newest first.
CREATE TABLE lead_notes (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id        uuid NOT NULL REFERENCES organizations(id),
  intake_submission_id uuid NOT NULL REFERENCES intake_submissions(id),
  author_user_id uuid REFERENCES users(id),
  body          text NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  revision      bigint NOT NULL DEFAULT 1,
  deleted_at    timestamptz
);
CREATE INDEX idx_lead_notes_sub ON lead_notes (intake_submission_id, created_at DESC)
  WHERE deleted_at IS NULL;

-- New table needs RLS + touch-trigger coverage; re-run the platform DO blocks.
DO $$
DECLARE t record;
BEGIN
  FOR t IN
    SELECT c.table_name FROM information_schema.columns c
    JOIN information_schema.columns c2
      ON c2.table_name = c.table_name AND c2.column_name = 'revision'
    WHERE c.table_schema = 'public' AND c.column_name = 'updated_at'
    GROUP BY c.table_name
  LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = format('trg_touch_%s', t.table_name)
                   AND tgrelid = format('public.%I', t.table_name)::regclass) THEN
      EXECUTE format('CREATE TRIGGER trg_touch_%I BEFORE UPDATE ON %I
                      FOR EACH ROW EXECUTE FUNCTION touch_row()', t.table_name, t.table_name);
    END IF;
  END LOOP;
END $$;

DO $$
DECLARE t record;
BEGIN
  FOR t IN
    SELECT DISTINCT table_name FROM information_schema.columns
    WHERE table_schema = 'public' AND column_name = 'org_id'
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t.table_name);
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = t.table_name
                   AND policyname = format('tenant_isolation_%s', t.table_name)) THEN
      EXECUTE format('CREATE POLICY tenant_isolation_%I ON %I
                      USING (org_id = current_setting(''app.org_id'', true)::uuid)',
                     t.table_name, t.table_name);
    END IF;
  END LOOP;
END $$;
