-- ============================================================================
-- 033 FORCE RLS on intake_submissions — the homeowner-PII lead record (contact
-- name / email / phone, property address, project details). Same guarantee we
-- gave the pricing tables (031/032), now for the customer data. (intake_photos
-- is created later, in 060, and is FORCE'd in 061.)
--
-- Access paths, all now org-scoped:
--   * GC reads/writes (leads, links, audit funnel, reveal head, photos):
--     routed through orgQuery.
--   * intake submit: convertSubmission now receives the org (from the link)
--     and sets app.org_id before reading the submission it just created.
--   * buyer decline: resolves the org from the proposal token, then updates
--     the submission's pipeline_stage under that context.
-- intake_links stays app-scoped (the public slug is the lookup key — the org
-- is discovered FROM it, so it cannot be org-gated).
-- ============================================================================
DO $$
BEGIN
  EXECUTE 'DROP POLICY IF EXISTS tenant_isolation_intake_submissions ON intake_submissions';
  EXECUTE 'CREATE POLICY tenant_isolation_intake_submissions ON intake_submissions
             USING (org_id = current_setting(''app.org_id'', true)::uuid)
             WITH CHECK (org_id = current_setting(''app.org_id'', true)::uuid)';
  EXECUTE 'ALTER TABLE intake_submissions ENABLE ROW LEVEL SECURITY';
  EXECUTE 'ALTER TABLE intake_submissions FORCE ROW LEVEL SECURITY';
END $$;
