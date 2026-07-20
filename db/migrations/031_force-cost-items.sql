-- ============================================================================
-- 031 FORCE RLS on cost_items — the learned rate library (the GC's PRIVATE
-- prices; "your prices never pool" is precisely this table).
--
-- cost_items is GC-only: buyers never read it (they read the frozen estimate
-- lines via a token, not the rate library). Every access path now carries an
-- org context:
--   * generate: convert.ts sets app.org_id before generateDraftEstimate(client)
--   * edit: editIntoNewVersion sets app.org_id from the source version's org
--   * ratelib / insights / account export: routed through orgQuery/withOrg
--   * provisioning clone: reads the template catalog under the template org's
--     context, then inserts the new org's rows under the new org's context
--
-- With FORCE, the non-superuser owner role used in prod cannot read or write
-- another org's rates even if an app-level `WHERE org_id = $1` is ever dropped.
-- (org_id is NOT NULL on cost_items, so no platform-seed exception is needed.)
-- ============================================================================
DO $$
BEGIN
  EXECUTE 'DROP POLICY IF EXISTS tenant_isolation_cost_items ON cost_items';
  EXECUTE 'CREATE POLICY tenant_isolation_cost_items ON cost_items
             USING (org_id = current_setting(''app.org_id'', true)::uuid)
             WITH CHECK (org_id = current_setting(''app.org_id'', true)::uuid)';
  EXECUTE 'ALTER TABLE cost_items ENABLE ROW LEVEL SECURITY';
  EXECUTE 'ALTER TABLE cost_items FORCE ROW LEVEL SECURITY';
END $$;
