// Gap 4: create a new intake link.
import { currentUserEmail } from "../../../lib/auth/server";
import { resolveWorkspace } from "../../../lib/workspace";
import { createLink, CHANNELS, type Channel } from "../../../lib/links/repo";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const user = await currentUserEmail();
  if (!user) return Response.json({ error: "not signed in" }, { status: 401 });
  const ws = await resolveWorkspace(user.email);
  if (!ws) return Response.json({ error: "no workspace" }, { status: 403 });

  let body: { label?: string; channel?: string };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "bad body" }, { status: 400 });
  }
  const channel = (CHANNELS.includes(body.channel as Channel) ? body.channel : "link") as Channel;
  const label = (body.label ?? "").trim().slice(0, 120) || "New link";
  const created = await createLink(ws.orgId, label, channel, ws.orgName);
  return Response.json({ ok: true, ...created });
}
