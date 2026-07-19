// Identity → tenancy mapping (DB-gated).
import { afterAll, describe, expect, it } from "vitest";
import { resolveWorkspace } from "../lib/workspace";
import { getPool } from "../lib/db";

const d = describe.skipIf(!process.env.DATABASE_URL);

d("resolveWorkspace", () => {
  afterAll(async () => {
    await getPool().end();
  });

  it("maps the fixture GC email (case-insensitively) to the fixture org", async () => {
    const ws = await resolveWorkspace("Test-GC@example.com");
    expect(ws).not.toBeNull();
    expect(ws?.orgId).toBe("00000000-0000-4000-8000-000000000001");
    expect(ws?.orgName).toBe("Fixture Renovations LLC");
    expect(ws?.role).toBe("owner_admin");
  });

  it("returns null for an unknown email — no silent org, ever", async () => {
    expect(await resolveWorkspace("stranger@example.com")).toBeNull();
  });
});
