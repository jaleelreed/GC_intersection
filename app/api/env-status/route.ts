// Deployment diagnostic: which EXPECTED env names are present. Presence
// booleans only, from a fixed allowlist — values never leave the process.
// Exists to verify what the Neon<->Vercel integration injected.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const EXPECTED = [
  "DATABASE_URL",
  "DATABASE_URL_UNPOOLED",
  "POSTGRES_URL",
  "NEON_AUTH_BASE_URL",
  "NEON_AUTH_COOKIE_SECRET",
] as const;

export async function GET() {
  const presence = Object.fromEntries(EXPECTED.map((k) => [k, Boolean(process.env[k])]));

  // Auth-derivation diagnostic: hostnames and upstream status only — never
  // values. Removed once live auth is verified.
  let auth_derivation: Record<string, unknown> = { note: "no DATABASE_URL" };
  try {
    const { deriveAuthBaseUrl } = await import("../../../lib/auth/derive");
    const unpooled = process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL;
    if (unpooled) {
      const derived = process.env.NEON_AUTH_BASE_URL ?? deriveAuthBaseUrl(unpooled);
      const u = new URL(derived);
      let upstream_status: number | string = "unreachable";
      try {
        const r = await fetch(`${derived}/session`, { method: "GET", signal: AbortSignal.timeout(8000) });
        upstream_status = r.status;
      } catch (e) {
        upstream_status = `fetch failed: ${(e as Error).message}`;
      }
      auth_derivation = {
        source: process.env.NEON_AUTH_BASE_URL ? "env" : "derived",
        auth_host: u.hostname,
        auth_path: u.pathname,
        upstream_status,
      };
    }
  } catch (e) {
    auth_derivation = { error: (e as Error).message };
  }

  return Response.json({ ...presence, auth_derivation });
}
