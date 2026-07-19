// Gap 8: team mutations — invite / remove. Owner only.
import { currentUserEmail } from "../../../lib/auth/server";
import { resolveWorkspace } from "../../../lib/workspace";
import { addMember, removeMember } from "../../../lib/team/repo";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function isEmail(s: string): boolean {
  return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(s);
}

export async function POST(req: Request) {
  const user = await currentUserEmail();
  if (!user) return Response.json({ error: "not signed in" }, { status: 401 });
  const ws = await resolveWorkspace(user.email);
  if (!ws) return Response.json({ error: "no workspace" }, { status: 403 });
  if (ws.role !== "owner_admin") return Response.json({ error: "owner only" }, { status: 403 });

  let body: { action?: string; email?: string; membershipId?: string };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "bad body" }, { status: 400 });
  }

  if (body.action === "add") {
    const email = String(body.email ?? "").trim().toLowerCase();
    if (!isEmail(email)) return Response.json({ error: "valid email required" }, { status: 400 });
    const result = await addMember(ws.orgId, email);
    return Response.json({ ok: true, result });
  }
  if (body.action === "remove") {
    if (!body.membershipId) return Response.json({ error: "membershipId required" }, { status: 400 });
    const ok = await removeMember(ws.orgId, body.membershipId, ws.userId);
    return Response.json({ ok }, { status: ok ? 200 : 409 });
  }
  return Response.json({ error: "unknown action" }, { status: 400 });
}
