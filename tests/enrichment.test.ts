// US-005c: county derivation + fixture enrichment behind the interface.
import { afterAll, describe, expect, it } from "vitest";
import { deriveCountyFips } from "../lib/enrichment/county";
import { FixtureEnrichmentProvider } from "../lib/enrichment/provider";
import { POST } from "../app/api/intake/[slug]/route";
import { getPool } from "../lib/db";
import { validPayload } from "./intake.schema.test";
import { cleanupSubmissions } from "./helpers/cleanup";

describe("deriveCountyFips (pure)", () => {
  it("maps the DC-area launch six", () => {
    expect(deriveCountyFips("20001")).toBe("11001"); // DC
    expect(deriveCountyFips("20852")).toBe("24031"); // Montgomery
    expect(deriveCountyFips("20740")).toBe("24033"); // Prince George's
    expect(deriveCountyFips("22201")).toBe("51013"); // Arlington
    expect(deriveCountyFips("22030")).toBe("51059"); // Fairfax
    expect(deriveCountyFips("22301")).toBe("51510"); // Alexandria (carve-out)
  });

  it("returns null for unknown zips — never guesses", () => {
    expect(deriveCountyFips("10001")).toBeNull();
    expect(deriveCountyFips("90210")).toBeNull();
    expect(deriveCountyFips("")).toBeNull();
  });
});

describe("FixtureEnrichmentProvider (pure)", () => {
  it("returns canned extract for a known address, deterministic", async () => {
    const p = new FixtureEnrichmentProvider();
    const a = await p.enrich({ line1: "123 Fixture St NW" });
    expect(a.provider).toBe("fixture");
    expect(a.extracted.year_built).toBe(1926);
    expect(await p.enrich({ line1: "123 Fixture St NW" })).toEqual(a);
  });

  it("returns an EMPTY extract for unknown addresses — the normal state", async () => {
    const p = new FixtureEnrichmentProvider();
    const r = await p.enrich({ line1: "1 Nowhere Ln" });
    expect(r.extracted).toEqual({});
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

d("US-005c wired into submission", () => {
  afterAll(async () => {
    await cleanupSubmissions(getPool(), "%@enrich-test.example");
    await getPool().end();
  });

  it("stores county_fips + a provenance-carrying snapshot", async () => {
    const res = await POST(
      request({ ...validPayload(), contact_email: "e1@enrich-test.example" }),
      params("fixture-link")
    );
    expect(res.status).toBe(201);
    const { id } = await res.json();

    const row = (
      await getPool().query(
        `SELECT s.county_fips, e.provider, e.extracted
         FROM intake_submissions s
         LEFT JOIN enrichment_snapshots e ON e.id = s.enrichment_snapshot_id
         WHERE s.id = $1`,
        [id]
      )
    ).rows[0];
    expect(row.county_fips).toBe("11001"); // 20001 → DC
    expect(row.provider).toBe("fixture");
    expect(row.extracted.year_built).toBe(1926); // known fixture address
  });

  it("unknown zip → null county, submission still proceeds and converts", async () => {
    const res = await POST(
      request({
        ...validPayload(),
        contact_email: "e2@enrich-test.example",
        address_line1: "1 Nowhere Ln",
        city: "New York",
        state: "NY",
        postal_code: "10001",
      }),
      params("fixture-link")
    );
    expect(res.status).toBe(201);
    const { id } = await res.json();
    const row = (
      await getPool().query(
        `SELECT s.county_fips, s.status, e.extracted
         FROM intake_submissions s
         LEFT JOIN enrichment_snapshots e ON e.id = s.enrichment_snapshot_id
         WHERE s.id = $1`,
        [id]
      )
    ).rows[0];
    expect(row.county_fips).toBeNull();
    expect(row.status).toBe("converted");
    expect(row.extracted).toEqual({}); // empty enrichment is normal
  });
});
