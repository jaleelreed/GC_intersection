-- ============================================================================
-- 030 RLS ENFORCEMENT (GC_intersection)
-- The tenant_isolation policies (from 000/090) key off the app.org_id GUC but
-- were inert: the app connects as the table owner, which BYPASSES RLS unless
-- FORCE is set, and nothing set the GUC. This migration makes RLS REAL on a
-- contained, verified set of purely org-scoped tables — the ones accessed only
-- through code that now runs inside withOrg()/setOrg() (lib/db.ts).
--
-- Scope note (honest): identity tables (organizations/users/org_memberships)
-- are read to ESTABLISH the org before it is known, and token-accessed tables
-- (proposals, estimate_versions/lines, intake_links) are read by the buyer
-- with no org context — org-keyed RLS does not fit those access patterns, so
-- they remain application-scoped (every query carries WHERE org_id = $1, which
-- is tested). Extending RLS there needs a token/security-definer redesign.
-- ============================================================================

-- Add WITH CHECK to the tenant policies so INSERT/UPDATE are constrained too
-- (the originals only had USING, which governs read/visibility). Recreate.
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['lead_notes','notifications']
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

-- NOTE ON ENFORCEMENT: FORCE RLS makes the table owner subject to RLS, and a
-- non-superuser role (prod: Neon's app role) is subject to it too. A SUPERUSER
-- always bypasses RLS — CI's postgres role is a superuser, so runtime blocking
-- can't be demonstrated there; the test instead verifies the FORCE flag +
-- WITH CHECK policy are configured (pg_class.relforcerowsecurity, pg_policies).
-- In production, connect the app as a non-superuser role for RLS to bite.
