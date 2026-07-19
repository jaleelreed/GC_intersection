// Onboarding: first sign-in yields a working, isolated workspace whose very
// first draft prices from the cloned starter config. DB-gated.
import { afterAll, describe, expect, it } from "vitest";
import { ensureWorkspace } from "../lib/onboarding/provision";
import { resolveWorkspace } from "../lib/workspace";
import { intakeLinkForOrg } from "../lib/intake/repo";
import { POST } from "../app/api/intake/[slug]/route";
import { getPool } from "../lib/db";
import { validPayload } from "./intake.schema.test";
import { cleanupSubmissions } from "./helpers/cleanup";

const d = describe.skipIf(!process.env.DATABASE_URL);

function request(body: unknown) {
  return new Request("http://test.local/api/intake/x", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}
const params = (slug: string) => ({ params: Promise.resolve({ slug }) });

d("onboarding: auto-provision on first sign-in", () => {
  const email = `owner+${Date.now()}@onboard-test.example`;
  let orgId = "";

  afterAll(async () => {
    const pool = getPool();
    await cleanupSubmissions(pool, "%@onboard-test.example");
    if (orgId) {
      // tear down the provisioned config + org (children first)
      await pool.query(`DELETE FROM assembly_components WHERE org_id = $1`, [orgId]);
      await pool.query(`DELETE FROM scope_assembly_map WHERE org_id = $1`, [orgId]);
      await pool.query(`DELETE FROM assemblies WHERE org_id = $1`, [orgId]);
      await pool.query(`DELETE FROM cost_items WHERE org_id = $1`, [orgId]);
      await pool.query(`DELETE FROM assembly_modifiers WHERE org_id = $1`, [orgId]);
      await pool.query(`DELETE FROM markup_templates WHERE org_id = $1`, [orgId]);
      await pool.query(`DELETE FROM intake_links WHERE org_id = $1`, [orgId]);
      await pool.query(
        `DELETE FROM org_memberships WHERE org_id = $1`,
        [orgId]
      );
      await pool.query(`DELETE FROM users WHERE lower(email) = lower($1)`, [email]);
      await pool.query(`DELETE FROM organizations WHERE id = $1`, [orgId]);
    }
    await pool.end();
  });

  it("creates org + membership + link + a full starter config, idempotently", async () => {
    const ws = await ensureWorkspace(email, "Dana Builder");
    orgId = ws.orgId;
    expect(ws.role).toBe("owner_admin");
    expect(ws.orgName).toContain("Dana Builder");

    // idempotent: second call returns the SAME org, no duplicate config
    const again = await ensureWorkspace(email, "Dana Builder");
    expect(again.orgId).toBe(ws.orgId);

    const counts = async (table: string) =>
      Number(
        (await getPool().query(`SELECT count(*)::int AS n FROM ${table} WHERE org_id = $1`, [orgId])).rows[0].n
      );
    expect(await counts("assemblies")).toBe(10);
    expect(await counts("cost_items")).toBe(12);
    expect(await counts("assembly_modifiers")).toBeGreaterThan(10);
    expect(await counts("markup_templates")).toBe(2);
    expect(await intakeLinkForOrg(orgId)).not.toBeNull();

    // resolveWorkspace now finds it
    expect((await resolveWorkspace(email))?.orgId).toBe(orgId);
  });

  it("the new org's FIRST draft prices from the cloned config", async () => {
    const link = (await intakeLinkForOrg(orgId))!;
    const res = await POST(
      request({ ...validPayload(), contact_email: "lead@onboard-test.example" }),
      params(link.slug)
    );
    expect(res.status).toBe(201);
    const { id } = await res.json();

    const est = (
      await getPool().query(
        `SELECT v.grand_total, v.range_low, v.range_high, e.org_id
         FROM intake_submissions s
         JOIN estimates e ON e.id = s.estimate_id
         JOIN estimate_versions v ON v.id = e.current_version_id
         WHERE s.id = $1`,
        [id]
      )
    ).rows[0];
    expect(est.org_id).toBe(orgId); // isolated to the new workspace
    expect(Number(est.grand_total)).toBeGreaterThan(0);
    expect(Number(est.range_low)).toBeLessThan(Number(est.grand_total));
  });
});
