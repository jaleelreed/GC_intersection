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
  -- Transfer ownership of every migration-created object to the app role, so
  -- it is the table owner exactly like the prod role.
  REASSIGN OWNED BY gc TO app_owner;
  GRANT ALL ON ALL TABLES IN SCHEMA public TO app_owner;
  GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO app_owner;
`;

try {
  await admin.query(sql);
  console.log("app_owner ready: non-superuser owner (prod-equivalent RLS)");
} finally {
  await admin.end();
}
