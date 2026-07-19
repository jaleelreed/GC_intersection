// Zero-paste auth config: both Neon Auth inputs derive from the database URL
// the Neon<->Vercel integration already injects. Explicit env vars win when
// present (NEON_AUTH_BASE_URL / NEON_AUTH_COOKIE_SECRET); derivation is the
// fallback that keeps the operator out of the secrets business.
import { createHash } from "node:crypto";

/**
 * Neon Auth endpoints live at the database endpoint host with a `neonauth`
 * segment: ep-X.<region>.aws.neon.tech → ep-X.neonauth.<region>.aws.neon.tech,
 * path /<database>/auth. Derived from the UNPOOLED url (the pooled host
 * carries a -pooler suffix that does not exist in the auth hostname).
 */
export function deriveAuthBaseUrl(unpooledDbUrl: string): string {
  const u = new URL(unpooledDbUrl);
  const [endpoint, ...rest] = u.hostname.split(".");
  const host = [endpoint.replace(/-pooler$/, ""), "neonauth", ...rest].join(".");
  const db = u.pathname.replace(/^\//, "").split("/")[0] || "neondb";
  return `https://${host}/${db}/auth`;
}

/**
 * Cookie-signing secret derived from the connection string (which already
 * carries the deployment's secret entropy) plus a purpose salt. Rotating the
 * database password rotates this too — sessions drop, users sign in again;
 * an acceptable trade for never handling a second secret.
 */
export function deriveCookieSecret(dbUrl: string): string {
  return createHash("sha256").update(`${dbUrl}::gci-auth-cookie-v1`).digest("base64");
}
