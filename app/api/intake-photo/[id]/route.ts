// Serve an intake photo to the owning GC only (session + org guarded).
import { currentUserEmail } from "../../../../lib/auth/server";
import { resolveWorkspace } from "../../../../lib/workspace";
import { getPhoto } from "../../../../lib/intake/photos";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const user = await currentUserEmail();
  if (!user) return new Response("unauthorized", { status: 401 });
  const ws = await resolveWorkspace(user.email);
  if (!ws) return new Response("no workspace", { status: 403 });

  const photo = await getPhoto(ws.orgId, id);
  if (!photo) return new Response("not found", { status: 404 });

  return new Response(new Uint8Array(photo.bytes), {
    headers: {
      "content-type": photo.contentType,
      "cache-control": "private, max-age=3600",
    },
  });
}
