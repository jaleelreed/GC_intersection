// Rate library: edit + revert learned rates, and the effect on generation.
import { afterAll, describe, expect, it } from "vitest";
import { POST as INTAKE } from "../app/api/intake/[slug]/route";
import { editIntoNewVersion } from "../lib/estimate/edit";
import { currentEstimateForLead } from "../lib/estimate/read";
import { listRates, updateRate, deleteRate } from "../lib/ratelib/repo";
import { getPool } from "../lib/db";
import { validPayload } from "./intake.schema.test";
import { cleanupSubmissions } from "./helpers/cleanup";

const d = describe.skipIf(!process.env.DATABASE_URL);
const ORG = "00000000-0000-4000-8000-000000000001";

d("rate library", () => {
  afterAll(async () => {
    await cleanupSubmissions(getPool(), "%@ratelib-test.example");
    await getPool().end();
  });

  async function seedWithEdit(email: string) {
    const res = await INTAKE(
      new Request("http://t/i", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ...validPayload(), contact_email: email }),
      }),
      { params: Promise.resolve({ slug: "fixture-link" }) }
    );
    const { id } = await res.json();
    const est = (await currentEstimateForLead(id, ORG))!;
    const tile = est.lines.find((l) => l.description.includes("tile")) ?? est.lines[0];
    await editIntoNewVersion(est.versionId, [{ lineage_id: tile.lineage_id, unit_cost: "33.3300" }]);
  }

  it("lists learned rates, updates one, and reverts one", async () => {
    await seedWithEdit("r@ratelib-test.example");
    let rates = await listRates(ORG);
    const mine = rates.find((r) => Number(r.unit_cost) === 33.33);
    expect(mine).toBeDefined();

    expect(await updateRate(ORG, mine!.id, "44.0000")).toBe(true);
    rates = await listRates(ORG);
    expect(rates.find((r) => r.id === mine!.id)?.unit_cost).toBe("44.0000");

    expect(await deleteRate(ORG, mine!.id)).toBe(true);
    rates = await listRates(ORG);
    expect(rates.find((r) => r.id === mine!.id)).toBeUndefined(); // reverted (soft-deleted)
  });

  it("scopes updates to the org", async () => {
    await seedWithEdit("r2@ratelib-test.example");
    const rate = (await listRates(ORG))[0];
    expect(await updateRate("00000000-0000-4000-8000-0000000000ff", rate.id, "1.0000")).toBe(false);
  });
});
