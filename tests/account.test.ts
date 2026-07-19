// Legal/trust: data export + workspace deletion, on a throwaway workspace.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ensureWorkspace } from "../lib/onboarding/provision";
import { exportWorkspace, deleteWorkspace } from "../lib/account/repo";
import { resolveWorkspace } from "../lib/workspace";
import { getPool } from "../lib/db";

const d = describe.skipIf(!process.env.DATABASE_URL);

d("account controls", () => {
  const email = `del+${Date.now()}@account-test.example`;
  let orgId = "";

  beforeAll(async () => {
    orgId = (await ensureWorkspace(email, "Delete Me Co")).orgId;
  });

  afterAll(async () => {
    // If the delete test didn't run/succeeded, this is a no-op cleanup.
    await getPool().query(`DELETE FROM users WHERE lower(email) = lower($1)`, [email]);
    await getPool().end();
  });

  it("exports the workspace as structured data", async () => {
    const data = (await exportWorkspace(orgId)) as Record<string, unknown[]>;
    expect((data.organization as unknown[]).length).toBe(1);
    expect((data.intake_links as unknown[]).length).toBeGreaterThan(0);
    expect(Array.isArray(data.learned_prices)).toBe(true);
  });

  it("deletes the workspace and everything under it", async () => {
    await deleteWorkspace(orgId);
    expect(await resolveWorkspace(email)).toBeNull();
    const org = await getPool().query(`SELECT 1 FROM organizations WHERE id = $1`, [orgId]);
    expect(org.rows.length).toBe(0);
    const links = await getPool().query(`SELECT 1 FROM intake_links WHERE org_id = $1`, [orgId]);
    expect(links.rows.length).toBe(0);
  });
});
