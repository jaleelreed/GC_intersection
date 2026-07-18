// Fixed test account (US-004). Deterministic UUIDs so tests and fixtures can
// reference them; idempotent so reseeding is safe.
import { connect } from "./client.mjs";

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

  await client.query("COMMIT");
  console.log(`seeded fixed test account (org ${TEST_ORG_ID})`);
} catch (err) {
  await client.query("ROLLBACK");
  console.error(`seed failed: ${err.message}`);
  process.exit(1);
} finally {
  await client.end();
}
