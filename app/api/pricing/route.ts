// Rate library mutations (owner + PM). Update or revert a learned rate.
import { currentUserEmail } from "../../../lib/auth/server";
import { resolveWorkspace } from "../../../lib/workspace";
import { updateRate, deleteRate } from "../../../lib/ratelib/repo";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const user = await currentUserEmail();
  if (!user) return Response.json({ error: "not signed in" }, { status: 401 });
  const ws = await resolveWorkspace(user.email);
  if (!ws) return Response.json({ error: "no workspace" }, { status: 403 });
  if (ws.role === "read_only") return Response.json({ error: "no permission" }, { status: 403 });

  let body: { action?: string; id?: string; unit_cost?: string };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "bad body" }, { status: 400 });
  }
  if (!body.id) return Response.json({ error: "id required" }, { status: 400 });

  if (body.action === "update") {
    const uc = String(body.unit_cost ?? "").trim();
    if (!/^\d+(\.\d{1,4})?$/.test(uc)) return Response.json({ error: "invalid unit cost" }, { status: 400 });
    const ok = await updateRate(ws.orgId, body.id, Number(uc).toFixed(4));
    return Response.json({ ok }, { status: ok ? 200 : 404 });
  }
  if (body.action === "delete") {
    const ok = await deleteRate(ws.orgId, body.id);
    return Response.json({ ok }, { status: ok ? 200 : 404 });
  }
  return Response.json({ error: "unknown action" }, { status: 400 });
}
