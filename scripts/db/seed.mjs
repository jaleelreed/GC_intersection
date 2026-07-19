// Fixed test account (US-004). Deterministic UUIDs so tests and fixtures can
// reference them; idempotent so reseeding is safe.
import { connect } from "./client.mjs";
import { seedEstimating } from "./seed-estimating.mjs";

export const TEST_ORG_ID = "00000000-0000-4000-8000-000000000001";
export const TEST_USER_ID = "00000000-0000-4000-8000-000000000002";
export const TEST_MEMBERSHIP_ID = "00000000-0000-4000-8000-000000000003";

const client = connect();
await client.connect();

try {
  await client.query("BEGIN");

  await client.query(
    `INSERT INTO organizations (id, name, legal_name, org_kind)
     VALUES ($1, 'Fixture Renovations LLC', 'Fixture Renovations LLC', 'general_contractor')
     ON CONFLICT (id) DO NOTHING`,
    [TEST_ORG_ID]
  );

  await client.query(
    `INSERT INTO users (id, email, full_name)
     VALUES ($1, 'test-gc@example.com', 'Test GC')
     ON CONFLICT (id) DO NOTHING`,
    [TEST_USER_ID]
  );

  await client.query(
    `INSERT INTO org_memberships (id, org_id, user_id, role)
     VALUES ($1, $2, $3, 'owner_admin')
     ON CONFLICT (org_id, user_id) DO NOTHING`,
    [TEST_MEMBERSHIP_ID, TEST_ORG_ID, TEST_USER_ID]
  );

  // US-005c: the DC-area launch six — geography source of truth. Must exist
  // before any submission carries county_fips (FK from migration 011).
  const COUNTIES = [
    ["11001", "District of Columbia", "DC"],
    ["24031", "Montgomery County", "MD"],
    ["24033", "Prince George's County", "MD"],
    ["51013", "Arlington County", "VA"],
    ["51059", "Fairfax County", "VA"],
    ["51510", "Alexandria City", "VA"],
  ];
  for (const [fips, name, state] of COUNTIES) {
    await client.query(
      `INSERT INTO counties (fips, name, state_code, msa_code, msa_name)
       VALUES ($1, $2, $3, '47900', 'Washington-Arlington-Alexandria, DC-VA-MD-WV')
       ON CONFLICT (fips) DO NOTHING`,
      [fips, name, state]
    );
  }

  // US-005: one intake link per channel + an inactive one (404 test path).
  const LINKS = [
    ["00000000-0000-4000-8000-000000000101", "fixture-link", "link", true],
    ["00000000-0000-4000-8000-000000000102", "fixture-embed", "embed", true],
    ["00000000-0000-4000-8000-000000000103", "fixture-qr", "qr", true],
    ["00000000-0000-4000-8000-000000000104", "fixture-inactive", "link", false],
  ];
  for (const [id, slug, channel, active] of LINKS) {
    await client.query(
      `INSERT INTO intake_links (id, org_id, slug, channel, label, display_name, is_active)
       VALUES ($1, $2, $3, $4, $5, 'Fixture Renovations LLC', $6)
       ON CONFLICT (id) DO NOTHING`,
      [id, TEST_ORG_ID, slug, channel, `Fixture ${channel}`, active]
    );
  }

  // EP-02: estimating fixtures (cost codes, market costs, assemblies, map,
  // modifiers, markups) — the zero-setup answer to an empty cost database.
  const est = await seedEstimating(client);

  await client.query("COMMIT");
  console.log(
    `seeded fixed test account (org ${TEST_ORG_ID}) + ${LINKS.length} intake links + estimating fixtures ` +
      JSON.stringify(est)
  );
} catch (err) {
  await client.query("ROLLBACK");
  console.error(`seed failed: ${err.message}`);
  process.exit(1);
} finally {
  await client.end();
}
