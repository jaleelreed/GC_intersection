// Gap 5: convergence summary + learned rates reflect real edits.
import { afterAll, describe, expect, it } from "vitest";
import { POST as INTAKE } from "../app/api/intake/[slug]/route";
import { editIntoNewVersion } from "../lib/estimate/edit";
import { currentEstimateForLead } from "../lib/estimate/read";
import { convergenceSummary, learnedRates } from "../lib/insights/repo";
import { getPool } from "../lib/db";
import { validPayload } from "./intake.schema.test";
import { cleanupSubmissions } from "./helpers/cleanup";

const d = describe.skipIf(!process.env.DATABASE_URL);
const ORG = "00000000-0000-4000-8000-000000000001";

d("convergence insights", () => {
  afterAll(async () => {
    await cleanupSubmissions(getPool(), "%@insight-test.example");
    await getPool().end();
  });

  it("counts learned rates and reports edit coverage after an edit", async () => {
    const res = await INTAKE(
      new Request("http://t/i", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ...validPayload(), contact_email: "i1@insight-test.example" }),
      }),
      { params: Promise.resolve({ slug: "fixture-link" }) }
    );
    const { id } = await res.json();
    const est = (await currentEstimateForLead(id, ORG))!;

    const before = await convergenceSummary(ORG);

    // a price edit → learned rate + a second version
    await editIntoNewVersion(est.versionId, [
      { lineage_id: est.lines[0].lineage_id, unit_cost: "99.9900" },
    ]);

    const after = await convergenceSummary(ORG);
    expect(after.learnedRateCount).toBeGreaterThan(before.learnedRateCount);
    expect(after.estimatesEdited).toBeGreaterThanOrEqual(1);
    expect(after.avgEditCoveragePct).not.toBeNull();

    const rates = await learnedRates(ORG);
    expect(rates.some((r) => Number(r.unit_cost) === 99.99)).toBe(true);
  });
});
