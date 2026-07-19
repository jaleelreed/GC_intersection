// EP-02 (US-009..012b): the seed engine. Pure math + formula tests, then
// DB-gated end-to-end: submission → priced concept draft with range,
// drivers, trace — deterministic to the cent.
import { afterAll, describe, expect, it } from "vitest";
import { toScaled, mulScaled, scaledToCentsString, scaledToString } from "../lib/estimate/money";
import { evaluateFormula, FormulaError } from "../lib/estimate/formula";
import { assertConvertibleLine, LineStructureError } from "../lib/estimate/lines";
import { POST } from "../app/api/intake/[slug]/route";
import { getPool } from "../lib/db";
import { validPayload } from "./intake.schema.test";
import { cleanupSubmissions } from "./helpers/cleanup";

describe("money (exact scaled arithmetic)", () => {
  it("multiplies without float drift and rounds half-up at the cents boundary", () => {
    expect(scaledToString(mulScaled(toScaled("2.5000"), toScaled("3.1000")))).toBe("7.7500");
    expect(scaledToCentsString(mulScaled(toScaled("116.0000"), toScaled("9.9950")))).toBe("1159.42");
    expect(scaledToCentsString(toScaled("0.005"))).toBe("0.01"); // half-up
    // the classic float trap: 0.1 + 0.2
    expect(scaledToString(toScaled("0.1") + toScaled("0.2"))).toBe("0.3000");
  });
});

describe("formula evaluator (closed grammar, no eval)", () => {
  it("evaluates arithmetic over context identifiers", () => {
    expect(evaluateFormula("submission.square_footage * 0.08", { "submission.square_footage": 1450 })).toBeCloseTo(116);
    expect(evaluateFormula("(a + b) * 2 - 1", { a: 2, b: 3 })).toBe(9);
  });

  it("rejects unknown identifiers, bad tokens, and division by zero", () => {
    expect(() => evaluateFormula("nope * 2", {})).toThrow(FormulaError);
    expect(() => evaluateFormula("1; drop table", {})).toThrow(FormulaError);
    expect(() => evaluateFormula("1 / 0", {})).toThrow(FormulaError);
  });
});

describe("assertConvertibleLine (US-012b)", () => {
  const good = {
    cost_code_id: "x",
    cost_kind: "subcontract",
    description: "GWB hung",
    quantity: "278.4000",
    uom: "SF",
    unit_cost: "2.1000",
    total: "584.64",
    seed_source: "market_seed",
  };
  it("accepts a well-formed line and rejects each broken shape", () => {
    expect(() => assertConvertibleLine(good)).not.toThrow();
    expect(() => assertConvertibleLine({ ...good, cost_code_id: "" })).toThrow(LineStructureError);
    expect(() => assertConvertibleLine({ ...good, total: "999.99" })).toThrow(LineStructureError);
    expect(() => assertConvertibleLine({ ...good, seed_source: "vibes" })).toThrow(LineStructureError);
  });
});

const d = describe.skipIf(!process.env.DATABASE_URL);

function request(body: unknown) {
  return new Request("http://test.local/api/intake/x", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}
const params = (slug: string) => ({ params: Promise.resolve({ slug }) });

async function submitAndFetch(email: string, overrides: Record<string, unknown> = {}) {
  const res = await POST(
    request({ ...validPayload(), contact_email: email, ...overrides }),
    params("fixture-link")
  );
  expect(res.status).toBe(201);
  const { id } = await res.json();
  const row = (
    await getPool().query(
      `SELECT s.estimate_id, v.id AS version_id, v.grand_total, v.range_low, v.range_high,
              v.swing_drivers, e.class
       FROM intake_submissions s
       JOIN estimates e ON e.id = s.estimate_id
       JOIN estimate_versions v ON v.id = e.current_version_id
       WHERE s.id = $1`,
      [id]
    )
  ).rows[0];
  return { submissionId: id, ...row };
}

d("EP-02 end-to-end draft generation", () => {
  afterAll(async () => {
    await cleanupSubmissions(getPool(), "%@engine-test.example");
    await getPool().end();
  });

  it("creates a concept estimate: version, range around grand, named drivers", async () => {
    const e = await submitAndFetch("g1@engine-test.example");
    expect(e.class).toBe("concept");
    const grand = Number(e.grand_total);
    expect(grand).toBeGreaterThan(0);
    expect(Number(e.range_low)).toBeLessThan(grand);
    expect(Number(e.range_high)).toBeGreaterThan(grand);
    const driverNames = e.swing_drivers.map((x: { driver: string }) => x.driver);
    expect(driverNames).toContain("base concept uncertainty");
    expect(driverNames.some((n: string) => n.includes("pre_1940"))).toBe(true); // year 1938
    expect(driverNames.some((n: string) => n.includes("reconfigure"))).toBe(true); // bath class
  });

  it("every line satisfies the US-012b invariant in the database", async () => {
    const e = await submitAndFetch("g2@engine-test.example");
    const lines = (
      await getPool().query(
        `SELECT cost_code_id, quantity, uom, unit_cost, total, seed_source, lineage_id,
                round(quantity * unit_cost, 2) AS recomputed
         FROM estimate_lines WHERE estimate_version_id = $1`,
        [e.version_id]
      )
    ).rows;
    expect(lines.length).toBeGreaterThan(5);
    for (const l of lines) {
      expect(l.cost_code_id).not.toBeNull();
      expect(l.uom).not.toBeNull();
      expect(l.lineage_id).not.toBeNull();
      expect(l.seed_source).toBe("market_seed");
      expect(Number(l.total)).toBeCloseTo(Number(l.recomputed), 2);
    }
    const markups = (
      await getPool().query(
        `SELECT name, computed_amount FROM estimate_markups WHERE estimate_version_id = $1 ORDER BY apply_order`,
        [e.version_id]
      )
    ).rows;
    expect(markups.map((m) => m.name)).toEqual(["Overhead", "Profit"]);
  });

  it("D4: narrative does not move a single cent", async () => {
    const a = await submitAndFetch("g3@engine-test.example", { narrative: null });
    const b = await submitAndFetch("g4@engine-test.example", {
      narrative: "Gut everything, gold faucets, mold in the damp basement, knock out the walls.",
    });
    expect(b.grand_total).toBe(a.grand_total);
    expect(b.range_low).toBe(a.range_low);
    expect(b.range_high).toBe(a.range_high);
  });

  it("determinism: identical structured inputs price identically, to the cent", async () => {
    const a = await submitAndFetch("g5@engine-test.example");
    const b = await submitAndFetch("g6@engine-test.example");
    expect(b.grand_total).toBe(a.grand_total);
    expect(b.swing_drivers).toEqual(a.swing_drivers);
  });

  it("unknown scope class keeps the number and widens the band", async () => {
    const known = await submitAndFetch("g7@engine-test.example");
    const p = validPayload();
    p.scope_toggles.bath = { on: true, class: null }; // was reconfigure
    const unknown = await submitAndFetch("g8@engine-test.example", { scope_toggles: p.scope_toggles });

    // multiplier for reconfigure (1.25) is gone → grand drops; band % grows
    expect(Number(unknown.grand_total)).toBeLessThan(Number(known.grand_total));
    const spreadPct = (e: { range_low: string; range_high: string; grand_total: string }) =>
      (Number(e.range_high) - Number(e.range_low)) / Number(e.grand_total);
    expect(spreadPct(unknown)).toBeGreaterThan(spreadPct(known));
    const names = unknown.swing_drivers.map((x: { driver: string }) => x.driver);
    expect(names.some((n: string) => n.includes("scope_class:unknown"))).toBe(true);
  });

  it("writes the generation trace: determinism as data", async () => {
    const e = await submitAndFetch("g9@engine-test.example");
    const run = (
      await getPool().query(
        `SELECT cost_provider, inputs_snapshot, assemblies_fired, unknowns, grand_total
         FROM estimate_generation_runs WHERE estimate_version_id = $1`,
        [e.version_id]
      )
    ).rows[0];
    expect(run.cost_provider).toBe("FixtureCostProvider");
    expect(run.inputs_snapshot.square_footage).toBe(1450);
    expect(run.assemblies_fired.length).toBe(2); // bath + kitchen
    expect(run.grand_total).toBe(e.grand_total);
  });
});
