// Gap 3: add / delete lines + markup edits through editIntoNewVersion.
import { afterAll, describe, expect, it } from "vitest";
import { POST as INTAKE } from "../app/api/intake/[slug]/route";
import { editIntoNewVersion } from "../lib/estimate/edit";
import { currentEstimateForLead, costCodeOptions } from "../lib/estimate/read";
import { getPool } from "../lib/db";
import { validPayload } from "./intake.schema.test";
import { cleanupSubmissions } from "./helpers/cleanup";

const d = describe.skipIf(!process.env.DATABASE_URL);
const ORG = "00000000-0000-4000-8000-000000000001";

d("editor operations", () => {
  afterAll(async () => {
    await cleanupSubmissions(getPool(), "%@editops-test.example");
    await getPool().end();
  });

  async function seedVersion(email: string) {
    const res = await INTAKE(
      new Request("http://t/i", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ...validPayload(), contact_email: email }),
      }),
      { params: Promise.resolve({ slug: "fixture-link" }) }
    );
    const { id } = await res.json();
    const est = await currentEstimateForLead(id, ORG);
    return est!;
  }

  it("deletes a line: it's gone from the new version, base drops", async () => {
    const est = await seedVersion("del@editops-test.example");
    const victim = est.lines[0];
    const { newVersionId } = await editIntoNewVersion(est.versionId, [], { deletes: [victim.lineage_id] });
    const after = (
      await getPool().query(
        `SELECT count(*)::int AS n FROM estimate_lines WHERE estimate_version_id = $1 AND lineage_id = $2 AND deleted_at IS NULL`,
        [newVersionId, victim.lineage_id]
      )
    ).rows[0].n;
    expect(after).toBe(0);
  });

  it("adds a GC line: present, gc_edit, invariant-valid total", async () => {
    const est = await seedVersion("add@editops-test.example");
    const cc = (await costCodeOptions(ORG))[0];
    const { newVersionId } = await editIntoNewVersion(est.versionId, [], {
      adds: [{ description: "Custom dumpster", cost_code_id: cc.id, uom: "EA", quantity: "2", unit_cost: "450.0000" }],
    });
    const row = (
      await getPool().query(
        `SELECT quantity, unit_cost, total, seed_source, round(quantity*unit_cost,2) AS recomputed
         FROM estimate_lines WHERE estimate_version_id = $1 AND description = 'Custom dumpster'`,
        [newVersionId]
      )
    ).rows[0];
    expect(row.seed_source).toBe("gc_edit");
    expect(Number(row.total)).toBeCloseTo(Number(row.recomputed), 2);
    expect(Number(row.total)).toBeCloseTo(900, 2);
  });

  it("edits a markup rate: grand recomputes", async () => {
    const est = await seedVersion("mk@editops-test.example");
    const before = Number(est.grandTotal);
    const { newVersionId } = await editIntoNewVersion(est.versionId, [], {
      markups: [{ name: "Profit", rate_pct: "20" }],
    });
    const after = Number(
      (await getPool().query(`SELECT grand_total FROM estimate_versions WHERE id = $1`, [newVersionId])).rows[0].grand_total
    );
    expect(after).toBeGreaterThan(before); // profit 10% → 20%
  });
});
