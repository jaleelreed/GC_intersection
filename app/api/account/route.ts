// Data export + workspace deletion. Owner-only.
import { currentUserEmail } from "../../../lib/auth/server";
import { resolveWorkspace } from "../../../lib/workspace";
import { exportWorkspace, deleteWorkspace } from "../../../lib/account/repo";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const user = await currentUserEmail();
  if (!user) return Response.json({ error: "not signed in" }, { status: 401 });
  const ws = await resolveWorkspace(user.email);
  if (!ws) return Response.json({ error: "no workspace" }, { status: 403 });
  if (ws.role !== "owner_admin") return Response.json({ error: "owner only" }, { status: 403 });

  let body: { action?: string; confirm?: string };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "bad body" }, { status: 400 });
  }

  if (body.action === "export") {
    const data = await exportWorkspace(ws.orgId);
    return new Response(JSON.stringify(data, null, 2), {
      headers: {
        "content-type": "application/json",
        "content-disposition": `attachment; filename="gc-intersection-export.json"`,
      },
    });
  }
  if (body.action === "delete") {
    // Require the exact workspace name as a confirmation phrase.
    if (body.confirm !== ws.orgName) {
      return Response.json({ error: "type the workspace name to confirm" }, { status: 400 });
    }
    await deleteWorkspace(ws.orgId);
    return Response.json({ ok: true });
  }
  return Response.json({ error: "unknown action" }, { status: 400 });
}
