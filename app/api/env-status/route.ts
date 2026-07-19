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
  return Response.json(
    Object.fromEntries(EXPECTED.map((k) => [k, Boolean(process.env[k])]))
  );
}
