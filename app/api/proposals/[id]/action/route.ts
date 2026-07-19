// Gap 7: GC proposal actions — resend (new link) or withdraw. Guarded.
import { currentUserEmail } from "../../../../../lib/auth/server";
import { resolveWorkspace } from "../../../../../lib/workspace";
import { resendProposal, withdrawProposal } from "../../../../../lib/proposals/repo";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const user = await currentUserEmail();
  if (!user) return Response.json({ error: "not signed in" }, { status: 401 });
  const ws = await resolveWorkspace(user.email);
  if (!ws) return Response.json({ error: "no workspace" }, { status: 403 });

  let body: { action?: string };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "bad body" }, { status: 400 });
  }

  if (body.action === "resend") {
    const r = await resendProposal(ws.orgId, id);
    if (!r) return Response.json({ error: "cannot resend (not a live bid)" }, { status: 409 });
    const origin = new URL(req.url).origin;
    return Response.json({ ok: true, buyerUrl: `${origin}/p/${r.rawToken}` });
  }
  if (body.action === "withdraw") {
    const ok = await withdrawProposal(ws.orgId, id);
    return Response.json({ ok }, { status: ok ? 200 : 409 });
  }
  return Response.json({ error: "unknown action" }, { status: 400 });
}
