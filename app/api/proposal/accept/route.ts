// US-025: buyer accepts. Public (token-authorized, no account — EP-01/05
// non-goal). Acceptance is a state change only (D6) and freezes the version
// (D7); both happen inside acceptProposal.
import { acceptProposal } from "../../../../lib/proposals/repo";
import { checkRateLimit, clientKey, tooMany } from "../../../../lib/ratelimit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const rl = await checkRateLimit("accept", clientKey(req), 30, 60, Date.now());
  if (!rl.allowed) return tooMany();

  let body: { token?: string };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "bad body" }, { status: 400 });
  }
  if (!body.token) return Response.json({ error: "token required" }, { status: 400 });

  const result = await acceptProposal(body.token);
  if (!result) return Response.json({ error: "link is invalid or expired" }, { status: 404 });
  return Response.json({ ok: true });
}
