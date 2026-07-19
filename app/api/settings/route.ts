// Gap 6: settings mutations. One guarded endpoint, action-dispatched.
import { currentUserEmail } from "../../../lib/auth/server";
import { resolveWorkspace } from "../../../lib/workspace";
import { setBusinessName, toggleServiceArea, setMarkupRate } from "../../../lib/settings/repo";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const user = await currentUserEmail();
  if (!user) return Response.json({ error: "not signed in" }, { status: 401 });
  const ws = await resolveWorkspace(user.email);
  if (!ws) return Response.json({ error: "no workspace" }, { status: 403 });
  // Only owners change workspace settings.
  if (ws.role !== "owner_admin") return Response.json({ error: "owner only" }, { status: 403 });

  let body: { action?: string; [k: string]: unknown };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "bad body" }, { status: 400 });
  }

  switch (body.action) {
    case "business_name": {
      const name = String(body.name ?? "").trim().slice(0, 200);
      if (!name) return Response.json({ error: "name required" }, { status: 400 });
      await setBusinessName(ws.orgId, name);
      return Response.json({ ok: true });
    }
    case "service_area": {
      const fips = String(body.fips ?? "");
      if (!fips) return Response.json({ error: "fips required" }, { status: 400 });
      await toggleServiceArea(ws.orgId, fips, Boolean(body.add));
      return Response.json({ ok: true });
    }
    case "markup": {
      const id = String(body.id ?? "");
      const rate = String(body.rate_pct ?? "").trim();
      if (!id || rate === "") return Response.json({ error: "id and rate_pct required" }, { status: 400 });
      const ok = await setMarkupRate(ws.orgId, id, rate);
      return Response.json({ ok }, { status: ok ? 200 : 404 });
    }
    default:
      return Response.json({ error: "unknown action" }, { status: 400 });
  }
}
