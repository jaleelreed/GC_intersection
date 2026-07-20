// Server-side Neon Auth instance, lazily created AND lazily imported: the SDK
// pulls next/headers (only resolvable inside a Next build), so a static import
// would drag it into any module graph that references auth — including vitest.
// Dynamic import keeps it out until auth is actually invoked at runtime.
import { deriveAuthBaseUrl, deriveCookieSecret } from "./derive";

type NeonAuth = Awaited<ReturnType<typeof buildAuth>>;

let instance: NeonAuth | undefined;

async function buildAuth() {
  const { createNeonAuth } = await import("@neondatabase/auth/next/server");
  const dbUrl = process.env.DATABASE_URL;
  const unpooled = process.env.DATABASE_URL_UNPOOLED ?? dbUrl;
  if (!dbUrl || !unpooled) throw new Error("DATABASE_URL is not set");
  return createNeonAuth({
    baseUrl: process.env.NEON_AUTH_BASE_URL ?? deriveAuthBaseUrl(unpooled),
    cookies: {
      secret: process.env.NEON_AUTH_COOKIE_SECRET ?? deriveCookieSecret(dbUrl),
    },
  });
}

export async function getAuth(): Promise<NeonAuth> {
  if (!instance) instance = await buildAuth();
  return instance;
}

export async function currentUserEmail(): Promise<{ email: string; name: string | null } | null> {
  // E2E auth bypass — ONLY for the CI e2e job (E2E_AUTH_SECRET set). Defense in
  // depth: even if that secret were ever present in a real deployment, the
  // VERCEL_ENV==="production" guard keeps this path structurally inert in prod.
  // CI never sets VERCEL_ENV, so the bypass still works there.
  if (process.env.E2E_AUTH_SECRET && process.env.VERCEL_ENV !== "production") {
    try {
      const { cookies } = await import("next/headers");
      const c = await cookies();
      if (c.get("e2e_auth")?.value === process.env.E2E_AUTH_SECRET) {
        const email = c.get("e2e_email")?.value;
        if (email) return { email, name: "E2E User" };
      }
    } catch {
      /* not in a request context — fall through */
    }
  }
  try {
    const auth = await getAuth();
    const { data } = await auth.getSession();
    const user = data?.user;
    if (!user?.email) return null;
    return { email: user.email, name: user.name ?? null };
  } catch {
    return null;
  }
}
