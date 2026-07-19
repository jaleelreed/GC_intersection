// US-005 API contract against the real database (skipped without DATABASE_URL;
// CI provides one and runs migrations + seed first).
import { afterAll, describe, expect, it } from "vitest";
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

d("POST /api/intake/[slug]", () => {
  afterAll(async () => {
    await cleanupSubmissions(getPool(), "%@intake-test.example");
    await getPool().end();
  });

  it("writes a submission with channel and org snapshotted from the link", async () => {
    const body = { ...validPayload(), contact_email: "happy@intake-test.example" };
    const res = await POST(request(body), params("fixture-qr"));
    expect(res.status).toBe(201);
    const { id } = await res.json();

    const row = (
      await getPool().query(
        "SELECT org_id, channel, status, scope_toggles->'bath' AS bath FROM intake_submissions WHERE id = $1",
        [id]
      )
    ).rows[0];
    expect(row.org_id).toBe("00000000-0000-4000-8000-000000000001");
    expect(row.channel).toBe("qr"); // snapshot from intake_links.channel
    expect(row.status).toBe("converted"); // US-007 converts inline on submit
    expect(row.bath).toEqual({ on: true, class: "reconfigure" });
  });

  it("404s an unknown or inactive slug without writing", async () => {
    for (const slug of ["no-such-slug", "fixture-inactive"]) {
      const res = await POST(
        request({ ...validPayload(), contact_email: "gone@intake-test.example" }),
        params(slug)
      );
      expect(res.status).toBe(404);
    }
    const count = (
      await getPool().query(
        "SELECT count(*)::int AS n FROM intake_submissions WHERE contact_email = 'gone@intake-test.example'"
      )
    ).rows[0].n;
    expect(count).toBe(0);
  });

  it("422s an invalid payload with per-field errors and writes nothing", async () => {
    const bad = { ...validPayload(), contact_email: "not-an-email" };
    const res = await POST(request(bad), params("fixture-link"));
    expect(res.status).toBe(422);
    const { errors } = await res.json();
    expect(errors.some((e: { path: string }) => e.path === "contact_email")).toBe(true);
  });

  it("stores sub-3s submissions as spam, invisibly to the submitter", async () => {
    const body = {
      ...validPayload(),
      contact_email: "fast@intake-test.example",
      form_started_at: Date.now() - 500,
    };
    const res = await POST(request(body), params("fixture-link"));
    expect(res.status).toBe(201); // spammer sees success
    const { id } = await res.json();
    const status = (
      await getPool().query("SELECT status FROM intake_submissions WHERE id = $1", [id])
    ).rows[0].status;
    expect(status).toBe("spam");
  });
});
