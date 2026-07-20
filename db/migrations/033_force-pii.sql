-- ============================================================================
-- 033 FORCE RLS on the homeowner-PII tables — intake_submissions (contact
-- name / email / phone, property address, project details) and intake_photos.
-- Same guarantee we gave the pricing tables (031/032), now for the customer
-- data: a non-superuser owner role cannot read/write another org's leads or
-- photos even if an app-level `WHERE org_id` is ever forgotten.
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
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['intake_submissions', 'intake_photos']
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS tenant_isolation_%I ON %I', t, t);
    EXECUTE format(
      'CREATE POLICY tenant_isolation_%I ON %I
         USING (org_id = current_setting(''app.org_id'', true)::uuid)
         WITH CHECK (org_id = current_setting(''app.org_id'', true)::uuid)',
      t, t);
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
  END LOOP;
END $$;
