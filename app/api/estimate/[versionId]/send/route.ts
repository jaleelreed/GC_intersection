// US-017: send the bid. Guarded (session + workspace + version-owned). Creates
// a proposal and mints a buyer access token; returns the buyer link. The raw
// token exists only in this response and the link — never stored in the clear.
import { currentUserEmail } from "../../../../../lib/auth/server";
import { resolveWorkspace } from "../../../../../lib/workspace";
import { getPool } from "../../../../../lib/db";
import { createProposal, sendProposal } from "../../../../../lib/proposals/repo";
import { sendOutbound, proposalEmailHtml } from "../../../../../lib/mail/send";

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
      `SELECT v.id, pr.name AS project_name
       FROM estimate_versions v
       JOIN estimates e ON e.id = v.estimate_id
       LEFT JOIN projects pr ON pr.id = e.project_id
       WHERE v.id = $1 AND v.org_id = $2 AND v.deleted_at IS NULL`,
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
  const buyerUrl = `${origin}/p/${rawToken}`;

  // Attempt delivery; the outcome tells the GC whether to also copy the link.
  const { outcome } = await sendOutbound({
    orgId: ws.orgId,
    kind: "proposal_delivery",
    subjectTable: "proposals",
    subjectId: proposalId,
    recipientEmail: body.recipientEmail,
    subject: `Your estimate from ${ws.orgName}`,
    html: proposalEmailHtml(ws.orgName, owned.project_name ?? "your project", buyerUrl),
  });

  return Response.json({ ok: true, proposalId, buyerUrl, delivery: outcome });
}
