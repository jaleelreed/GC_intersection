// Rate limiter: allows up to the limit per window, blocks beyond, isolates keys.
import { afterAll, describe, expect, it } from "vitest";
import { checkRateLimit } from "../lib/ratelimit";
import { getPool } from "../lib/db";

const d = describe.skipIf(!process.env.DATABASE_URL);

d("checkRateLimit", () => {
  // Real now so expires_at is in the future (a past timestamp would be swept
  // by the opportunistic cleanup); the 4 calls share one 60s window bucket.
  const now = Date.now();
  const client = `test-${now}`;

  afterAll(async () => {
    await getPool().query(`DELETE FROM rate_limits WHERE bucket_key LIKE $1`, [`%${client}%`]);
    await getPool().end();
  });

  it("allows up to the limit then blocks", async () => {
    const results = [];
    for (let i = 0; i < 4; i++) {
      results.push(await checkRateLimit("t", client, 3, 60, now));
    }
    expect(results.slice(0, 3).every((r) => r.allowed)).toBe(true);
    expect(results[3].allowed).toBe(false); // 4th over a limit of 3
  });

  it("separates different clients", async () => {
    const a = await checkRateLimit("t", `${client}-a`, 1, 60, now);
    const b = await checkRateLimit("t", `${client}-b`, 1, 60, now);
    expect(a.allowed).toBe(true);
    expect(b.allowed).toBe(true); // different key, its own budget
  });
});
