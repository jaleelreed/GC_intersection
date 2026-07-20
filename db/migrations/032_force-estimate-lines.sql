-- ============================================================================
-- 032 FORCE RLS on estimate_lines — the priced bid line items (quantities x
-- unit costs). The second half of "your prices never pool": cost_items (031)
-- is the rate library; estimate_lines is what those rates produce per job.
--
-- Access paths, all now org-scoped:
--   * generate / edit: run inside an org context (convert setOrg; edit setOrg)
--   * reveal + coverage reads (read.ts), edit-coverage metric (editMetrics):
--     routed through orgQuery with the caller's org
--   * buyer bid view (bidLinesForToken): resolves the org from the proposal
--     token (proposal_access_tokens is not FORCE'd — the token is the auth),
--     then reads the lines under that org's context
--
-- estimate_versions / proposals stay token-gated + app-scoped: the buyer holds
-- an unguessable token to their own bid, and those carry the summary, not the
-- line-level cost breakdown that estimate_lines does.
-- ============================================================================
DO $$
BEGIN
  EXECUTE 'DROP POLICY IF EXISTS tenant_isolation_estimate_lines ON estimate_lines';
  EXECUTE 'CREATE POLICY tenant_isolation_estimate_lines ON estimate_lines
             USING (org_id = current_setting(''app.org_id'', true)::uuid)
             WITH CHECK (org_id = current_setting(''app.org_id'', true)::uuid)';
  EXECUTE 'ALTER TABLE estimate_lines ENABLE ROW LEVEL SECURITY';
  EXECUTE 'ALTER TABLE estimate_lines FORCE ROW LEVEL SECURITY';
END $$;
