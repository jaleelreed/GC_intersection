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
