// DB-backed fixed-window rate limiter (serverless-safe; no Redis needed).
// Fail-OPEN: if the limiter query errors, the request proceeds — availability
// beats a hard block from a transient DB hiccup on a public endpoint.
import { getPool } from "./db";

export interface RateResult {
  allowed: boolean;
  remaining: number;
}

export function clientKey(req: Request): string {
  const xff = req.headers.get("x-forwarded-for") ?? "";
  const ip = xff.split(",")[0].trim() || req.headers.get("x-real-ip") || "unknown";
  return ip;
}

/**
 * Allow up to `limit` requests per `windowSec` for a (route, client) pair.
 * Uses a bucketed counter; the window epoch is passed in (Date.now is not
 * available in some contexts, but route handlers have it).
 */
export async function checkRateLimit(
  route: string,
  client: string,
  limit: number,
  windowSec: number,
  nowMs: number
): Promise<RateResult> {
  const windowEpoch = Math.floor(nowMs / 1000 / windowSec);
  const key = `${route}:${client}:${windowEpoch}`;
  const expires = new Date(nowMs + windowSec * 1000).toISOString();
  try {
    const r = await getPool().query<{ count: number }>(
      `INSERT INTO rate_limits (bucket_key, count, expires_at)
       VALUES ($1, 1, $2)
       ON CONFLICT (bucket_key) DO UPDATE SET count = rate_limits.count + 1
       RETURNING count`,
      [key, expires]
    );
    const count = r.rows[0].count;
    // Opportunistic cleanup (cheap, keeps the table small).
    if (count === 1) {
      await getPool().query(`DELETE FROM rate_limits WHERE expires_at < now()`).catch(() => {});
    }
    return { allowed: count <= limit, remaining: Math.max(0, limit - count) };
  } catch {
    return { allowed: true, remaining: limit }; // fail open
  }
}

export function tooMany(): Response {
  return Response.json(
    { error: "too many requests — slow down and try again shortly" },
    { status: 429, headers: { "retry-after": "60" } }
  );
}
