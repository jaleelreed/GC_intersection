// US-005b: extraction is deterministic, provenance-carrying, and never prices.
import { afterAll, describe, expect, it } from "vitest";
import { extractHints } from "../lib/intake/hints";
import { POST } from "../app/api/intake/[slug]/route";
import { getPool } from "../lib/db";
import { validPayload } from "./intake.schema.test";
import { cleanupSubmissions } from "./helpers/cleanup";

describe("extractHints (pure, deterministic)", () => {
  it("matches rules with excerpts and modest confidence", () => {
    const hints = extractHints(
      "We want to open up the kitchen wall. The basement smells damp after rain. Previous owner did some DIY wiring."
    );
    const kinds = hints.map((h) => h.kind).sort();
    expect(kinds).toEqual(["risk_flag", "risk_flag", "scope_hint"]);
    for (const h of hints) {
      expect(h.source_excerpt.length).toBeGreaterThan(0);
      expect(h.confidence).toBeLessThanOrEqual(0.6);
    }
    // determinism
    expect(extractHints("The basement is damp")).toEqual(extractHints("The basement is damp"));
  });

  it("returns nothing for an unremarkable narrative", () => {
    expect(extractHints("We would like a nicer kitchen with new cabinets.")).toEqual([]);
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

d("US-005b stored hints", () => {
  afterAll(async () => {
    await cleanupSubmissions(getPool(), "%@hints-test.example");
    await getPool().end();
  });

  it("submission with narrative creates ai_job + hints, verified_by pending", async () => {
    const res = await POST(
      request({
        ...validPayload(),
        contact_email: "h1@hints-test.example",
        narrative: "Basement gets damp in spring and we want to knock down the dining wall.",
      }),
      params("fixture-link")
    );
    expect(res.status).toBe(201);
    const { id } = await res.json();

    const hints = (
      await getPool().query(
        `SELECT kind, source_excerpt, ai_job_id, ai_confidence, verified_by
         FROM intake_scope_hints WHERE intake_submission_id = $1 ORDER BY kind`,
        [id]
      )
    ).rows;
    expect(hints.length).toBe(2);
    for (const h of hints) {
      expect(h.ai_job_id).not.toBeNull();
      expect(h.verified_by).toBeNull(); // pending until a GC acts
      expect(Number(h.ai_confidence)).toBeLessThanOrEqual(0.6);
    }

    const job = (
      await getPool().query("SELECT status, model FROM ai_jobs WHERE id = $1", [hints[0].ai_job_id])
    ).rows[0];
    expect(job.status).toBe("complete");
    expect(job.model).toBe("keyword-rules-v1");

    const note = (
      await getPool().query(
        "SELECT body FROM notifications WHERE subject_id = $1 LIMIT 1",
        [id]
      )
    ).rows[0];
    expect(note.body).toContain("2 notes from their description");
  });

  it("empty narrative creates no ai_job and no hints", async () => {
    const res = await POST(
      request({ ...validPayload(), contact_email: "h2@hints-test.example", narrative: null }),
      params("fixture-link")
    );
    const { id } = await res.json();
    const n = (
      await getPool().query(
        "SELECT count(*)::int AS c FROM intake_scope_hints WHERE intake_submission_id = $1",
        [id]
      )
    ).rows[0].c;
    expect(n).toBe(0);
  });
});
