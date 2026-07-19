// Server-side Neon Auth instance, lazily created so builds and DB-less test
// runs never require auth configuration.
import { createNeonAuth } from "@neondatabase/auth/next/server";
import { deriveAuthBaseUrl, deriveCookieSecret } from "./derive";

type NeonAuth = ReturnType<typeof createNeonAuth>;

let instance: NeonAuth | undefined;

export function getAuth(): NeonAuth {
  if (!instance) {
    const dbUrl = process.env.DATABASE_URL;
    const unpooled = process.env.DATABASE_URL_UNPOOLED ?? dbUrl;
    if (!dbUrl || !unpooled) throw new Error("DATABASE_URL is not set");
    instance = createNeonAuth({
      baseUrl: process.env.NEON_AUTH_BASE_URL ?? deriveAuthBaseUrl(unpooled),
      cookies: {
        secret: process.env.NEON_AUTH_COOKIE_SECRET ?? deriveCookieSecret(dbUrl),
      },
    });
  }
  return instance;
}

export async function currentUserEmail(): Promise<{ email: string; name: string | null } | null> {
  try {
    const { data } = await getAuth().getSession();
    const user = data?.user;
    if (!user?.email) return null;
    return { email: user.email, name: user.name ?? null };
  } catch {
    return null;
  }
}
