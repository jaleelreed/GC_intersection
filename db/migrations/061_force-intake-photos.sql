-- ============================================================================
-- 061 FORCE RLS on intake_photos (photos of the property, homeowner-uploaded).
-- Separate from 033 because intake_photos is created in 060; this runs after.
-- GC-only access (buyers never read photos); all queries routed through
-- orgQuery in lib/intake/photos.ts.
-- ============================================================================
DO $$
BEGIN
  EXECUTE 'DROP POLICY IF EXISTS tenant_isolation_intake_photos ON intake_photos';
  EXECUTE 'CREATE POLICY tenant_isolation_intake_photos ON intake_photos
             USING (org_id = current_setting(''app.org_id'', true)::uuid)
             WITH CHECK (org_id = current_setting(''app.org_id'', true)::uuid)';
  EXECUTE 'ALTER TABLE intake_photos ENABLE ROW LEVEL SECURITY';
  EXECUTE 'ALTER TABLE intake_photos FORCE ROW LEVEL SECURITY';
END $$;
