// US-004 smoke: the app answers 200. Tests the route handler directly —
// CI additionally curls the running server after `next build`.
import { describe, expect, it } from "vitest";
import { GET } from "../app/api/health/route";

describe("GET /api/health", () => {
  it("returns 200 with ok body", async () => {
    const res = await GET();
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true });
  });
});
