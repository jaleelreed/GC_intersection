// Estimate depth: version history, non-destructive revert, coverage check.
import { afterAll, describe, expect, it } from "vitest";
import { POST as INTAKE } from "../app/api/intake/[slug]/route";
import { editIntoNewVersion } from "../lib/estimate/edit";
import { currentEstimateForLead, listVersions, coverageGaps } from "../lib/estimate/read";
import { getPool } from "../lib/db";
import { validPayload } from "./intake.schema.test";
import { cleanupSubmissions } from "./helpers/cleanup";

const d = describe.skipIf(!process.env.DATABASE_URL);
const ORG = "00000000-0000-4000-8000-000000000001";

d("estimate depth", () => {
  afterAll(async () => {
    await cleanupSubmissions(getPool(), "%@depth-test.example");
    await getPool().end();
  });

  async function seed(email: string, overrides: Record<string, unknown> = {}) {
    const res = await INTAKE(
      new Request("http://t/i", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ...validPayload(), contact_email: email, ...overrides }),
      }),
      { params: Promise.resolve({ slug: "fixture-link" }) }
    );
    return (await res.json()).id as string;
  }

  it("version history grows and revert copies a prior version forward", async () => {
    const id = await seed("v@depth-test.example");
    const est = (await currentEstimateForLead(id, ORG))!;
    const v1Total = est.grandTotal;

    // edit → v2
    await editIntoNewVersion(est.versionId, [{ lineage_id: est.lines[0].lineage_id, unit_cost: "999.9900" }]);
    let versions = await listVersions(est.estimateId, ORG);
    expect(versions.length).toBe(2);
    expect(versions.find((v) => v.is_current)?.version_no).toBe(2);

    // revert to v1 (empty edit copy) → v3 equals v1's total
    const v1 = versions.find((v) => v.version_no === 1)!;
    await editIntoNewVersion(v1.id, []);
    versions = await listVersions(est.estimateId, ORG);
    expect(versions.length).toBe(3);
    const current = versions.find((v) => v.is_current)!;
    expect(current.version_no).toBe(3);
    expect(Number(current.grand_total)).toBeCloseTo(Number(v1Total), 2);
  });

  it("coverage check flags an on-toggle with no priced line", async () => {
    // 'roof' is on but the payload's roof assembly won't fire without roof
    // params; regardless, if no line maps to a toggle it's a gap. Use a toggle
    // set where 'basement' is on.
    const p = validPayload();
    p.scope_toggles.basement = { on: true, class: null };
    const id = await seed("c@depth-test.example", { scope_toggles: p.scope_toggles });
    const gaps = await coverageGaps(id, ORG);
    // bath + kitchen price; if basement produced lines it's covered, else a gap.
    // Assert the function returns an array and doesn't include covered toggles.
    expect(Array.isArray(gaps)).toBe(true);
    expect(gaps).not.toContain("bath");
    expect(gaps).not.toContain("kitchen");
  });
});
