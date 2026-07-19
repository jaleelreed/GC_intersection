// US-007 conversion contract (DB-gated; CI runs it against the container).
import { afterAll, describe, expect, it } from "vitest";
import { POST } from "../app/api/intake/[slug]/route";
import { buildProjectName, convertSubmission } from "../lib/intake/convert";
import { getPool } from "../lib/db";
import { validPayload } from "./intake.schema.test";

const d = describe.skipIf(!process.env.DATABASE_URL);

function request(body: unknown) {
  return new Request("http://test.local/api/intake/x", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}
const params = (slug: string) => ({ params: Promise.resolve({ slug }) });

describe("buildProjectName (pure)", () => {
  const toggles = (on: string[]) =>
    Object.fromEntries(
      ["bath", "kitchen", "floors", "walls", "utilities", "plumbing", "electric", "mechanical", "roof", "basement"].map(
        (k) => [k, { on: on.includes(k), class: null }]
      )
    );

  it("names from address + up to two toggles, with overflow marker", () => {
    expect(buildProjectName("12 Main St", toggles(["bath"]))).toBe("12 Main St — bath");
    expect(buildProjectName("12 Main St", toggles(["bath", "kitchen"]))).toBe("12 Main St — bath + kitchen");
    expect(buildProjectName("12 Main St", toggles(["bath", "kitchen", "roof"]))).toBe("12 Main St — bath + kitchen +");
    expect(buildProjectName("12 Main St", toggles([]))).toBe("12 Main St — renovation");
  });
});

d("US-007 auto-create", () => {
  afterAll(async () => {
    const pool = getPool();
    await pool.query(
      `DELETE FROM intake_submissions WHERE contact_email LIKE '%@convert-test.example'`
    );
    await pool.query(`DELETE FROM projects WHERE address_line1 LIKE '%Convert Test%'`);
    await pool.end();
  });

  async function submit(email: string, extra: Record<string, unknown> = {}) {
    const res = await POST(
      request({ ...validPayload(), contact_email: email, address_line1: "9 Convert Test Way", ...extra }),
      params("fixture-link")
    );
    expect(res.status).toBe(201);
    return (await res.json()).id as string;
  }

  it("converts a submission into a project atomically", async () => {
    const id = await submit("a@convert-test.example");
    const sub = (
      await getPool().query(
        "SELECT status, project_id FROM intake_submissions WHERE id = $1",
        [id]
      )
    ).rows[0];
    expect(sub.status).toBe("converted");
    expect(sub.project_id).not.toBeNull();

    const project = (
      await getPool().query(
        "SELECT code, name, stage, sector, address_line1, zip, gross_sf FROM projects WHERE id = $1",
        [sub.project_id]
      )
    ).rows[0];
    expect(project.code).toMatch(/^INT-\d{4}-\d{3,}$/);
    expect(project.name).toContain("9 Convert Test Way");
    expect(project.stage).toBe("pursuit");
    expect(project.sector).toBe("residential");
    expect(project.address_line1).toBe("9 Convert Test Way");
    expect(project.zip).toBe("20001");
    expect(Number(project.gross_sf)).toBe(1450);
  });

  it("increments the org-scoped code sequence", async () => {
    const id1 = await submit("s1@convert-test.example");
    const id2 = await submit("s2@convert-test.example");
    const codes = (
      await getPool().query(
        `SELECT p.code FROM projects p
         JOIN intake_submissions s ON s.project_id = p.id
         WHERE s.id = ANY($1) ORDER BY p.code`,
        [[id1, id2]]
      )
    ).rows.map((r) => r.code);
    // Parallel test workers convert concurrently, so neighbors may take
    // intermediate numbers — assert strict increase, not adjacency.
    expect(codes.length).toBe(2);
    const seq = (c: string) => Number(c.split("-")[2]);
    expect(seq(codes[1])).toBeGreaterThan(seq(codes[0]));
  });

  it("is idempotent: replaying returns the same project", async () => {
    const id = await submit("idem@convert-test.example");
    const first = (
      await getPool().query("SELECT project_id FROM intake_submissions WHERE id = $1", [id])
    ).rows[0].project_id;
    const replay = await convertSubmission(id);
    expect(replay).toBe(first);
    const count = (
      await getPool().query(
        `SELECT count(*)::int AS n FROM projects p
         JOIN intake_submissions s ON s.project_id = p.id WHERE s.id = $1`,
        [id]
      )
    ).rows[0].n;
    expect(count).toBe(1);
  });

  it("never converts spam", async () => {
    const id = await submit("spam@convert-test.example", {
      form_started_at: Date.now() - 500,
    });
    const sub = (
      await getPool().query(
        "SELECT status, project_id FROM intake_submissions WHERE id = $1",
        [id]
      )
    ).rows[0];
    expect(sub.status).toBe("spam");
    expect(sub.project_id).toBeNull();
    expect(await convertSubmission(id)).toBeNull(); // even called directly
  });
});
