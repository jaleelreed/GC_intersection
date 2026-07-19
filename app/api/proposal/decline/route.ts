// US-026: buyer declines. Public (token-authorized). Terminal, no payment.
import { declineProposal } from "../../../../lib/proposals/repo";
import { checkRateLimit, clientKey, tooMany } from "../../../../lib/ratelimit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const rl = await checkRateLimit("decline", clientKey(req), 30, 60, Date.now());
  if (!rl.allowed) return tooMany();

  let body: { token?: string; reason?: string };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "bad body" }, { status: 400 });
  }
  if (!body.token) return Response.json({ error: "token required" }, { status: 400 });
  const result = await declineProposal(body.token, (body.reason ?? "").trim().slice(0, 500) || undefined);
  if (!result) return Response.json({ error: "link is invalid or expired" }, { status: 404 });
  return Response.json({ ok: true });
}
