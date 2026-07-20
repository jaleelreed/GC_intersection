-- ============================================================================
-- 034 FORCE RLS on the remaining bid + proposal tables. Completes DB-level
-- tenant isolation for the estimate/proposal domain:
--   estimates, estimate_versions, estimate_markups, estimate_generation_runs,
--   projects, proposals, proposal_events
--
-- Access is now org-scoped on every path:
--   * GC: read.ts / insights / listProposals via orgQuery; edit + generate set
--     app.org_id (edit takes opts.orgId, convert sets it before generate); the
--     estimate API routes (edit/revert/send) scope their ownership checks.
--   * buyer: getProposalByToken / acceptProposal / askQuestion / declineProposal
--     resolve the org from the proposal token (scopeToToken) before touching
--     these rows; the token tables (proposal_access_tokens) stay app-scoped.
-- ============================================================================
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'estimates', 'estimate_versions', 'estimate_markups', 'estimate_generation_runs',
    'projects', 'proposals', 'proposal_events'
  ]
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
