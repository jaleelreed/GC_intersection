// US-002 / US-004 smoke against a real database (skipped when DATABASE_URL is
// absent, e.g. a laptop without Postgres; CI always provides one).
// Asserts structure, not behavior: migrations applied, RLS enabled with
// policies, D7/D8 mechanisms present, fixed test account seeded.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import pg from "pg";

const url = process.env.DATABASE_URL;
const d = describe.skipIf(!url);

const TEST_ORG_ID = "00000000-0000-4000-8000-000000000001";

d("database (migrated + seeded)", () => {
  let client: pg.Client;

  beforeAll(async () => {
    client = new pg.Client({ connectionString: url });
    await client.connect();
  });

  afterAll(async () => {
    await client?.end();
  });

  it("applied all four migrations", async () => {
    const r = await client.query("SELECT filename FROM schema_migrations ORDER BY filename");
    expect(r.rows.map((x) => x.filename)).toEqual([
      "000_launch-subset.sql",
      "010_residential-intake.sql",
      "011_generation-and-delivery.sql",
      "020_lead-pipeline.sql",
      "030_rls-enforce.sql",
      "031_force-cost-items.sql",
      "032_force-estimate-lines.sql",
      "040_rate-limits.sql",
      "050_bid-customization.sql",
      "060_intake-photos.sql",
      "090_reapply-platform-blocks.sql",
    ]);
  });

  it("created launch tables across all domains", async () => {
    const expected = [
      "organizations", // 000, domain 01
      "estimate_lines", // 000, domain 07
      "benchmark_observations", // 000, domain 09
      "intake_submissions", // 010
      "estimate_generation_runs", // 011
    ];
    const r = await client.query(
      "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_name = ANY($1)",
      [expected]
    );
    expect(r.rows.map((x) => x.table_name).sort()).toEqual([...expected].sort());
  });

  it("enabled RLS with a tenant policy on every org_id table (incl. domains 10/11)", async () => {
    const r = await client.query(`
      SELECT c.table_name,
             cl.relrowsecurity,
             (SELECT count(*) FROM pg_policies p
               WHERE p.schemaname = 'public' AND p.tablename = c.table_name
                 AND p.policyname = 'tenant_isolation_' || c.table_name) AS tenant_policies
      FROM (SELECT DISTINCT table_name FROM information_schema.columns
             WHERE table_schema = 'public' AND column_name = 'org_id') c
      JOIN pg_class cl ON cl.relname = c.table_name
      JOIN pg_namespace n ON n.oid = cl.relnamespace AND n.nspname = 'public'
      WHERE cl.relkind = 'r'`);
    expect(r.rows.length).toBeGreaterThan(20);
    const uncovered = r.rows.filter((x) => !x.relrowsecurity || Number(x.tenant_policies) !== 1);
    expect(uncovered.map((x) => x.table_name)).toEqual([]);
  });

  it("grants platform-seed read on assembly_modifiers and scope_assembly_map", async () => {
    const r = await client.query(
      `SELECT tablename FROM pg_policies
       WHERE schemaname = 'public' AND policyname LIKE 'platform_seed_read_%'`
    );
    expect(r.rows.map((x) => x.tablename).sort()).toEqual(["assembly_modifiers", "scope_assembly_map"]);
  });

  it("has the D7 guard trigger and D8 lineage_id on estimate lines", async () => {
    const trg = await client.query(
      "SELECT 1 FROM pg_trigger WHERE tgname = 'trg_guard_locked_lines'"
    );
    expect(trg.rows.length).toBe(1);
    const col = await client.query(
      `SELECT is_nullable FROM information_schema.columns
       WHERE table_name = 'estimate_lines' AND column_name = 'lineage_id'`
    );
    expect(col.rows).toEqual([{ is_nullable: "NO" }]);
  });

  it("seeded the fixed test account", async () => {
    const r = await client.query(
      `SELECT o.name, m.role
       FROM organizations o
       JOIN org_memberships m ON m.org_id = o.id
       WHERE o.id = $1`,
      [TEST_ORG_ID]
    );
    expect(r.rows).toEqual([{ name: "Fixture Renovations LLC", role: "owner_admin" }]);
  });
});
