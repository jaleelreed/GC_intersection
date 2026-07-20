// The company test: a GC edit is captured (US-019), harvested (US-020), and
// the NEXT draft starts from the GC's own number (US-021) — measurably
// closer (US-022). All DB-gated; CI runs it against the container.
import { afterAll, describe, expect, it } from "vitest";
import { POST } from "../app/api/intake/[slug]/route";
import { editIntoNewVersion, editMetrics } from "../lib/estimate/edit";
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

async function submit(email: string) {
  const res = await POST(
    request({ ...validPayload(), contact_email: email }),
    params("fixture-link")
  );
  expect(res.status).toBe(201);
  const { id } = await res.json();
  return (
    await getPool().query(
      `SELECT s.id AS submission_id, e.id AS estimate_id, e.current_version_id AS version_id
       FROM intake_submissions s JOIN estimates e ON e.id = s.estimate_id WHERE s.id = $1`,
      [id]
    )
  ).rows[0];
}

d("the convergence loop", () => {
  afterAll(async () => {
    await cleanupSubmissions(getPool(), "%@loop-test.example");
    await getPool().end();
  });

  it("edit → new version (immutable prior), observation, harvest, precedence, metrics", async () => {
    const pool = getPool();

    // ---- bid #1: market-seeded draft --------------------------------------
    const first = await submit("loop1@loop-test.example");
    const tileLine = (
      await pool.query(
        `SELECT lineage_id, unit_cost, quantity, total FROM estimate_lines
         WHERE estimate_version_id = $1 AND description LIKE 'Ceramic tile%'`,
        [first.version_id]
      )
    ).rows[0];
    expect(tileLine).toBeDefined();

    // ---- the GC corrects tile to THEIR price ------------------------------
    const MY_TILE_PRICE = "21.5000";
    const { newVersionId, editedLineageIds } = await editIntoNewVersion(first.version_id, [
      { lineage_id: tileLine.lineage_id, unit_cost: MY_TILE_PRICE },
    ]);
    expect(editedLineageIds).toEqual([tileLine.lineage_id]);

    // versioned, never destructive: v1 untouched, v2 carries the edit,
    // lineage survives, total = qty × new unit to the cent.
    const v1Line = (
      await pool.query(
        `SELECT unit_cost, seed_source FROM estimate_lines WHERE estimate_version_id = $1 AND lineage_id = $2`,
        [first.version_id, tileLine.lineage_id]
      )
    ).rows[0];
    expect(v1Line.unit_cost).toBe(tileLine.unit_cost);
    const v2Line = (
      await pool.query(
        `SELECT unit_cost, seed_source, quantity, total, round(quantity * unit_cost, 2) AS recomputed
         FROM estimate_lines WHERE estimate_version_id = $1 AND lineage_id = $2`,
        [newVersionId, tileLine.lineage_id]
      )
    ).rows[0];
    expect(v2Line.unit_cost).toBe(MY_TILE_PRICE);
    expect(v2Line.seed_source).toBe("gc_edit");
    expect(Number(v2Line.total)).toBeCloseTo(Number(v2Line.recomputed), 2);

    // US-019: the observation exists, keyed to the job's feasibility dims.
    const obs = (
      await pool.query(
        `SELECT o.unit_cost, o.scope_class, o.finish_tier, o.msa_code
         FROM benchmark_observations o
         JOIN estimate_lines l ON l.id = o.source_id AND o.source_table = 'estimate_lines'
         WHERE l.estimate_version_id = $1 AND l.lineage_id = $2`,
        [newVersionId, tileLine.lineage_id]
      )
    ).rows[0];
    expect(obs).toBeDefined();
    expect(obs.unit_cost).toBe(MY_TILE_PRICE);
    expect(obs.finish_tier).toBe("mid");
    expect(obs.msa_code).toBe("47900");

    // US-020: harvested into the org cost database with provenance.
    const harvested = (
      await pool.query(
        `SELECT sub_unit_cost, source, source_observation_id FROM cost_items
         WHERE org_id = '00000000-0000-4000-8000-000000000001'
           AND source = 'harvested_bid' AND sub_unit_cost = $1`,
        [MY_TILE_PRICE]
      )
    ).rows[0];
    expect(harvested).toBeDefined();
    expect(harvested.source_observation_id).not.toBeNull();

    // US-022: metrics over lineage.
    const m = await editMetrics("00000000-0000-4000-8000-000000000001", first.version_id, newVersionId);
    expect(m.touched).toBe(1);
    expect(m.editCoverage).toBeGreaterThan(0);
    expect(m.editCoverage).toBeLessThan(0.34); // one line of many

    // ---- bid #2: the next draft starts from the GC's number ---------------
    const second = await submit("loop2@loop-test.example");
    const tile2 = (
      await pool.query(
        `SELECT unit_cost, seed_source, benchmark_unit_cost FROM estimate_lines
         WHERE estimate_version_id = $1 AND description LIKE 'Ceramic tile%'`,
        [second.version_id]
      )
    ).rows[0];
    expect(tile2.seed_source).toBe("learned"); // US-021: learned beats market
    expect(tile2.benchmark_unit_cost).toBe(MY_TILE_PRICE);

    // and the trace says so
    const run2 = (
      await pool.query(
        `SELECT precedence_log FROM estimate_generation_runs WHERE estimate_version_id = $1`,
        [second.version_id]
      )
    ).rows[0];
    const tileEntry = run2.precedence_log.find((p: { component: string }) =>
      p.component.startsWith("Ceramic tile")
    );
    expect(tileEntry.winner).toBe("learned");
  });

  it("D7 stands: locking a version makes further edits impossible", async () => {
    const e = await submit("loop3@loop-test.example");
    await getPool().query(`UPDATE estimate_versions SET locked_at = now() WHERE id = $1`, [e.version_id]);
    const line = (
      await getPool().query(
        `SELECT lineage_id FROM estimate_lines WHERE estimate_version_id = $1 LIMIT 1`,
        [e.version_id]
      )
    ).rows[0];
    // editIntoNewVersion copies lines into a NEW version — allowed — but any
    // direct write to the locked version is refused by the guard trigger.
    await expect(
      getPool().query(
        `UPDATE estimate_lines SET unit_cost = '1.0000' WHERE estimate_version_id = $1 AND lineage_id = $2`,
        [e.version_id, line.lineage_id]
      )
    ).rejects.toThrow(/locked/);
    // unlock so cleanup can remove the fixture rows
    await getPool().query(`UPDATE estimate_versions SET locked_at = NULL WHERE id = $1`, [e.version_id]);
  });
});
