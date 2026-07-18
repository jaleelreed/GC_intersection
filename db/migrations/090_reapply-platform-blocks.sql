-- ============================================================================
-- 090 RE-APPLY PLATFORM BLOCKS (GC_intersection, EP-00 / US-002)
-- The touch-trigger and RLS DO blocks in 000 iterate information_schema, so
-- tables created in 010/011 are only covered if those blocks run again LAST
-- (docs/schema/README.md ordering note). Re-run here, idempotently: the
-- originals in 000 are unguarded CREATEs and would fail on already-covered
-- tables.
-- ============================================================================

-- Touch triggers: updated_at + revision on every table with the standard columns.
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
    IF NOT EXISTS (
      SELECT 1 FROM pg_trigger
      WHERE tgname = format('trg_touch_%s', t.table_name)
        AND tgrelid = format('public.%I', t.table_name)::regclass
    ) THEN
      EXECUTE format(
        'CREATE TRIGGER trg_touch_%I BEFORE UPDATE ON %I
         FOR EACH ROW EXECUTE FUNCTION touch_row()',
        t.table_name, t.table_name);
    END IF;
  END LOOP;
END $$;

-- RLS: every table with org_id gets tenant isolation via the app.org_id GUC.
DO $$
DECLARE t record;
BEGIN
  FOR t IN
    SELECT DISTINCT table_name
    FROM information_schema.columns
    WHERE table_schema = 'public' AND column_name = 'org_id'
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t.table_name);
    IF NOT EXISTS (
      SELECT 1 FROM pg_policies
      WHERE schemaname = 'public' AND tablename = t.table_name
        AND policyname = format('tenant_isolation_%s', t.table_name)
    ) THEN
      EXECUTE format(
        'CREATE POLICY tenant_isolation_%I ON %I
         USING (org_id = current_setting(''app.org_id'', true)::uuid)',
        t.table_name, t.table_name);
    END IF;
  END LOOP;
END $$;

-- Platform-seed visibility: assembly_modifiers (010) and scope_assembly_map
-- (011) hold org_id NULL rows as platform defaults. The tenant policy above
-- hides NULL rows, so seed rows need their own read policy (011's closing
-- note). Writes to seed rows stay platform-only: no policy grants them.
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['assembly_modifiers', 'scope_assembly_map']
  LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_policies
      WHERE schemaname = 'public' AND tablename = t
        AND policyname = format('platform_seed_read_%s', t)
    ) THEN
      EXECUTE format(
        'CREATE POLICY platform_seed_read_%I ON %I
         FOR SELECT USING (org_id IS NULL)',
        t, t);
    END IF;
  END LOOP;
END $$;
