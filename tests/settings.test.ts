// Gap 6: settings mutations, org-scoped. Uses a throwaway org so the fixture
// org's name/markups aren't disturbed for other suites.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ensureWorkspace } from "../lib/onboarding/provision";
import {
  setBusinessName,
  serviceAreaOptions,
  toggleServiceArea,
  listMarkupTemplates,
  setMarkupRate,
} from "../lib/settings/repo";
import { getPool } from "../lib/db";

const d = describe.skipIf(!process.env.DATABASE_URL);

d("workspace settings", () => {
  const email = `settings+${Date.now()}@settings-test.example`;
  let orgId = "";

  beforeAll(async () => {
    orgId = (await ensureWorkspace(email, "Settings Co")).orgId;
  });

  afterAll(async () => {
    const pool = getPool();
    for (const t of ["org_service_areas", "assembly_components", "scope_assembly_map", "assemblies", "cost_items", "assembly_modifiers", "markup_templates", "intake_links"]) {
      await pool.query(`DELETE FROM ${t} WHERE org_id = $1`, [orgId]);
    }
    await pool.query(`DELETE FROM org_memberships WHERE org_id = $1`, [orgId]);
    await pool.query(`DELETE FROM users WHERE lower(email) = lower($1)`, [email]);
    await pool.query(`DELETE FROM organizations WHERE id = $1`, [orgId]);
    await pool.end();
  });

  it("business name updates the org and its links' display_name", async () => {
    await setBusinessName(orgId, "Reed Renovations");
    const org = (await getPool().query(`SELECT name FROM organizations WHERE id = $1`, [orgId])).rows[0];
    expect(org.name).toBe("Reed Renovations");
    const link = (
      await getPool().query(`SELECT display_name FROM intake_links WHERE org_id = $1 LIMIT 1`, [orgId])
    ).rows[0];
    expect(link.display_name).toBe("Reed Renovations");
  });

  it("service area toggles on and off", async () => {
    await toggleServiceArea(orgId, "11001", true);
    let opts = await serviceAreaOptions(orgId);
    expect(opts.find((c) => c.fips === "11001")?.active).toBe(true);
    await toggleServiceArea(orgId, "11001", false);
    opts = await serviceAreaOptions(orgId);
    expect(opts.find((c) => c.fips === "11001")?.active).toBe(false);
  });

  it("markup rate updates (org-scoped)", async () => {
    const markups = await listMarkupTemplates(orgId);
    expect(markups.length).toBeGreaterThan(0);
    expect(await setMarkupRate(orgId, markups[0].id, "15")).toBe(true);
    expect(await setMarkupRate("00000000-0000-4000-8000-0000000000ff", markups[0].id, "99")).toBe(false);
    const after = await listMarkupTemplates(orgId);
    expect(Number(after[0].rate_pct)).toBe(15);
  });
});
