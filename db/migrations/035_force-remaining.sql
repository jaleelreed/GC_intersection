-- ============================================================================
-- 035 FORCE RLS on the remaining org-scoped tables — completing DB-level tenant
-- isolation across every table that carries org_id:
--   org_service_areas, markup_templates, benchmark_observations, ai_jobs,
--   intake_scope_hints, enrichment_snapshots, audit_log
--
-- Access is org-scoped on every path: settings (orgQuery), generate/edit/convert
-- (setOrg), the reveal hints read (orgQuery), recentActivity (orgQuery),
-- enrichment storeSnapshot (orgQuery), audit() writes (always via a scoped
-- client, and swallowed on error), and the provisioning markup_templates clone
-- (prefetched under the template's context, then written under the new org's).
--
-- After this, the app-scoped tables that remain are only the intentional ones:
-- identity/bootstrap (users, organizations, org_memberships) and token/slug
-- lookups (proposal_access_tokens, intake_links), plus shared platform config
-- with nullable org_id (cost_codes, assemblies, scope_assembly_map,
-- assembly_modifiers, market_cost_items, counties).
-- ============================================================================
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'org_service_areas', 'markup_templates', 'benchmark_observations', 'ai_jobs',
    'intake_scope_hints', 'enrichment_snapshots', 'audit_log'
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
