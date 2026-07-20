// CI-only: create a non-superuser role that OWNS the schema objects, mirroring
// Neon's production role (neondb_owner is a non-superuser owner). The app steps
// then connect as this role, so RLS behaves exactly as it does in prod:
//   - non-FORCE tables: owner bypasses the policy (today's app-scoped tables)
//   - FORCE tables: owner IS subject to the policy → org context is required
// This turns the e2e journey into a real proof that tenant isolation is
// enforced under production-equivalent RLS — any FORCE'd table whose queries
// forget their org context fails here instead of leaking in production.
//
// Run AFTER migrate+seed+reset, connected as the bootstrap superuser (gc).
import pg from "pg";

const admin = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const sql = `
  DROP ROLE IF EXISTS app_owner;
  CREATE ROLE app_owner LOGIN PASSWORD 'app_pw'
    NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE INHERIT;
  GRANT USAGE, CREATE ON SCHEMA public TO app_owner;
  -- Make the app role the OWNER of the migration-created tables (only public
  -- schema objects — not system-owned objects), so RLS behaves as in prod:
  -- owner bypasses non-FORCE policies, and is subject to FORCE'd ones.
  DO $$
  DECLARE r record;
  BEGIN
    FOR r IN SELECT tablename FROM pg_tables WHERE schemaname = 'public' LOOP
      EXECUTE format('ALTER TABLE public.%I OWNER TO app_owner', r.tablename);
    END LOOP;
  END $$;
  GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO app_owner;
`;

try {
  await admin.query(sql);
  console.log("app_owner ready: non-superuser owner (prod-equivalent RLS)");
} finally {
  await admin.end();
}
