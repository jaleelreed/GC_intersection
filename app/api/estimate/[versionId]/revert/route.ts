// Estimate depth: revert to a prior version. Guarded + ownership-checked.
// A revert is non-destructive — it copies the target version forward as a new
// current version (history is preserved).
import { currentUserEmail } from "../../../../../lib/auth/server";
import { resolveWorkspace } from "../../../../../lib/workspace";
import { getPool } from "../../../../../lib/db";
import { editIntoNewVersion } from "../../../../../lib/estimate/edit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(_req: Request, ctx: { params: Promise<{ versionId: string }> }) {
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

  // No edits → editIntoNewVersion copies this version forward as the new current.
  const { newVersionId } = await editIntoNewVersion(versionId, []);
  return Response.json({ ok: true, newVersionId });
}
