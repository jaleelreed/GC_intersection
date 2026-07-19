// Neon Auth proxy route: the client SDK talks same-origin to /api/auth/*,
// this handler forwards to the Neon Auth endpoint. Config comes from the
// shared derivation layer — no pasted variables. Resolved lazily per request
// so builds without DATABASE_URL (local dev boxes) still succeed.
import { getAuth } from "../../../../lib/auth/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ all: string[] }> };

export async function GET(request: Request, ctx: Ctx) {
  return getAuth().handler().GET(request, ctx as never);
}

export async function POST(request: Request, ctx: Ctx) {
  return getAuth().handler().POST(request, ctx as never);
}
