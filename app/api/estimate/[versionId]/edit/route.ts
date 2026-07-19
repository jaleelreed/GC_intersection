// US-014/015: apply the GC's price edits. Session + workspace guarded, and
// ownership-checked (the version must belong to the caller's org) before the
// engine runs. The engine (editIntoNewVersion) does the versioning, capture,
// harvest, and D7-safe writes.
import { currentUserEmail } from "../../../../../lib/auth/server";
import { resolveWorkspace } from "../../../../../lib/workspace";
import { getPool } from "../../../../../lib/db";
import { editIntoNewVersion, type LineEdit, type NewLine, type MarkupEdit, type LineFlag } from "../../../../../lib/estimate/edit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request, ctx: { params: Promise<{ versionId: string }> }) {
  const { versionId } = await ctx.params;
  const user = await currentUserEmail();
  if (!user) return Response.json({ error: "not signed in" }, { status: 401 });
  const ws = await resolveWorkspace(user.email);
  if (!ws) return Response.json({ error: "no workspace" }, { status: 403 });

  // Ownership: the version's org must be the caller's org.
  const owned = (
    await getPool().query(
      `SELECT v.locked_at FROM estimate_versions v
       WHERE v.id = $1 AND v.org_id = $2 AND v.deleted_at IS NULL`,
      [versionId, ws.orgId]
    )
  ).rows[0];
  if (!owned) return Response.json({ error: "not found" }, { status: 404 });
  if (owned.locked_at) return Response.json({ error: "estimate is accepted and locked" }, { status: 409 });

  let body: { edits?: LineEdit[]; deletes?: string[]; adds?: NewLine[]; markups?: MarkupEdit[]; flags?: LineFlag[] };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "bad body" }, { status: 400 });
  }
  const edits = (body.edits ?? []).filter(
    (e) => e && typeof e.lineage_id === "string" && (e.quantity !== undefined || e.unit_cost !== undefined || e.description !== undefined)
  );
  const deletes = (body.deletes ?? []).filter((d) => typeof d === "string");
  const adds = (body.adds ?? []).filter(
    (a) => a && a.description?.trim() && a.cost_code_id && a.uom && a.quantity && a.unit_cost
  );
  const markups = (body.markups ?? []).filter((m) => m && m.name && m.rate_pct !== undefined);
  const flags = (body.flags ?? []).filter((f) => f && typeof f.lineage_id === "string");

  if (edits.length + deletes.length + adds.length + markups.length + flags.length === 0) {
    return Response.json({ error: "no changes" }, { status: 400 });
  }

  try {
    const { newVersionId, editedLineageIds } = await editIntoNewVersion(versionId, edits, {
      deletes,
      adds,
      markups,
      flags,
    });
    return Response.json({ ok: true, newVersionId, edited: editedLineageIds.length });
  } catch (err) {
    return Response.json({ error: (err as Error).message }, { status: 422 });
  }
}
