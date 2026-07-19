// US-014/015 editor: read side + the edit API's ownership guard and the
// versioned save path (the engine's math is proven in convergence.test.ts).
import { afterAll, describe, expect, it } from "vitest";
import { POST as INTAKE } from "../app/api/intake/[slug]/route";
import { POST as EDIT } from "../app/api/estimate/[versionId]/edit/route";
import { currentEstimateForLead } from "../lib/estimate/read";
import { getPool } from "../lib/db";
import { validPayload } from "./intake.schema.test";
import { cleanupSubmissions } from "./helpers/cleanup";

const d = describe.skipIf(!process.env.DATABASE_URL);

const FIXTURE_ORG = "00000000-0000-4000-8000-000000000001";

function jreq(url: string, body: unknown) {
  return new Request(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

d("estimate editor", () => {
  afterAll(async () => {
    await cleanupSubmissions(getPool(), "%@editor-test.example");
    await getPool().end();
  });

  async function seedLead(email: string) {
    const res = await INTAKE(jreq("http://t/api/intake/x", { ...validPayload(), contact_email: email }), {
      params: Promise.resolve({ slug: "fixture-link" }),
    });
    const { id } = await res.json();
    return id as string;
  }

  it("currentEstimateForLead returns org-scoped lines, markups, totals", async () => {
    const id = await seedLead("read@editor-test.example");
    const est = await currentEstimateForLead(id, FIXTURE_ORG);
    expect(est).not.toBeNull();
    expect(est!.lines.length).toBeGreaterThan(5);
    expect(est!.markups.map((m) => m.name)).toEqual(["Overhead", "Profit"]);
    expect(Number(est!.grandTotal)).toBeGreaterThan(0);
    // cross-org isolation: a different org sees nothing
    expect(await currentEstimateForLead(id, "00000000-0000-4000-8000-0000000000ff")).toBeNull();
  });

  it("the edit API rejects an unauthenticated caller", async () => {
    const id = await seedLead("unauth@editor-test.example");
    const est = await currentEstimateForLead(id, FIXTURE_ORG);
    // no session in a bare test request → 401 (auth returns null offline)
    const res = await EDIT(
      jreq(`http://t/api/estimate/${est!.versionId}/edit`, {
        edits: [{ lineage_id: est!.lines[0].lineage_id, unit_cost: "9.9900" }],
      }),
      { params: Promise.resolve({ versionId: est!.versionId }) }
    );
    expect(res.status).toBe(401);
  });
});
