// Gap 2: add a note to a lead.
import { currentUserEmail } from "../../../../../lib/auth/server";
import { resolveWorkspace } from "../../../../../lib/workspace";
import { addNote } from "../../../../../lib/leads/repo";
import { getPool } from "../../../../../lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const user = await currentUserEmail();
  if (!user) return Response.json({ error: "not signed in" }, { status: 401 });
  const ws = await resolveWorkspace(user.email);
  if (!ws) return Response.json({ error: "no workspace" }, { status: 403 });

  // ownership: the lead must belong to the caller's org
  const owned = (
    await getPool().query(
      `SELECT id FROM intake_submissions WHERE id = $1 AND org_id = $2 AND deleted_at IS NULL`,
      [id, ws.orgId]
    )
  ).rows[0];
  if (!owned) return Response.json({ error: "not found" }, { status: 404 });

  let body: { body?: string };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "bad body" }, { status: 400 });
  }
  const text = (body.body ?? "").trim();
  if (!text) return Response.json({ error: "empty note" }, { status: 400 });
  const note = await addNote(ws.orgId, id, ws.userId, text.slice(0, 4000));
  return Response.json({ ok: true, note });
}
