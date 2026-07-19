// Gap 2: set a lead's pipeline stage.
import { currentUserEmail } from "../../../../../lib/auth/server";
import { resolveWorkspace } from "../../../../../lib/workspace";
import { LEAD_STAGES, setStage, type LeadStage } from "../../../../../lib/leads/repo";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const user = await currentUserEmail();
  if (!user) return Response.json({ error: "not signed in" }, { status: 401 });
  const ws = await resolveWorkspace(user.email);
  if (!ws) return Response.json({ error: "no workspace" }, { status: 403 });

  let body: { stage?: string };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "bad body" }, { status: 400 });
  }
  if (!body.stage || !LEAD_STAGES.includes(body.stage as LeadStage)) {
    return Response.json({ error: "invalid stage" }, { status: 400 });
  }
  const ok = await setStage(ws.orgId, id, body.stage as LeadStage);
  if (!ok) return Response.json({ error: "not found" }, { status: 404 });
  return Response.json({ ok: true, stage: body.stage });
}
