// Called by the sign-in flow right after a successful OTP verify: ensures the
// authenticated identity has a workspace. Reads the session server-side —
// the email is never trusted from the request body.
import { currentUserEmail } from "../../../../lib/auth/server";
import { ensureWorkspace } from "../../../../lib/onboarding/provision";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST() {
  const user = await currentUserEmail();
  if (!user) return Response.json({ error: "not signed in" }, { status: 401 });
  const ws = await ensureWorkspace(user.email, user.name);
  return Response.json({ ok: true, orgId: ws.orgId, orgName: ws.orgName });
}
