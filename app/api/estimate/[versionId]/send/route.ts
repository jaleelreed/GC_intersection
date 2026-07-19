// US-017: send the bid. Guarded (session + workspace + version-owned). Creates
// a proposal and mints a buyer access token; returns the buyer link. The raw
// token exists only in this response and the link — never stored in the clear.
import { currentUserEmail } from "../../../../../lib/auth/server";
import { resolveWorkspace } from "../../../../../lib/workspace";
import { getPool } from "../../../../../lib/db";
import { createProposal, sendProposal } from "../../../../../lib/proposals/repo";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request, ctx: { params: Promise<{ versionId: string }> }) {
  const { versionId } = await ctx.params;
  const user = await currentUserEmail();
  if (!user) return Response.json({ error: "not signed in" }, { status: 401 });
  const ws = await resolveWorkspace(user.email);
  if (!ws) return Response.json({ error: "no workspace" }, { status: 403 });

  const owned = (
    await getPool().query(
      `SELECT id FROM estimate_versions WHERE id = $1 AND org_id = $2 AND deleted_at IS NULL`,
      [versionId, ws.orgId]
    )
  ).rows[0];
  if (!owned) return Response.json({ error: "not found" }, { status: 404 });

  let body: { recipientName?: string; recipientEmail?: string };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "bad body" }, { status: 400 });
  }
  if (!body.recipientEmail) return Response.json({ error: "recipient email required" }, { status: 400 });

  const { proposalId } = await createProposal({
    estimateVersionId: versionId,
    recipientName: body.recipientName ?? "",
    recipientEmail: body.recipientEmail,
  });
  const { rawToken } = await sendProposal(proposalId);

  const origin = new URL(req.url).origin;
  return Response.json({ ok: true, proposalId, buyerUrl: `${origin}/p/${rawToken}` });
}
