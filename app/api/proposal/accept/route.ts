// US-025: buyer accepts. Public (token-authorized, no account — EP-01/05
// non-goal). Acceptance is a state change only (D6) and freezes the version
// (D7); both happen inside acceptProposal.
import { acceptProposal } from "../../../../lib/proposals/repo";
import { rateGuard } from "../../../../lib/ratelimit";
import { sendOutbound } from "../../../../lib/mail/send";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const limited = await rateGuard(req, "accept", 30, 60);
  if (limited) return limited;

  let body: { token?: string };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "bad body" }, { status: 400 });
  }
  if (!body.token) return Response.json({ error: "token required" }, { status: 400 });

  const result = await acceptProposal(body.token);
  if (!result) return Response.json({ error: "link is invalid or expired" }, { status: 404 });

  // Confirmation to the buyer (queued if no mail provider is configured).
  if (result.recipientEmail) {
    await sendOutbound({
      orgId: result.orgId,
      kind: "proposal_accepted_confirmation",
      subjectTable: "proposals",
      subjectId: body.token.slice(0, 8),
      recipientEmail: result.recipientEmail,
      subject: `You accepted the estimate from ${result.orgName}`,
      html: `<p>You accepted the estimate for ${result.projectName} from ${result.orgName}.</p><p>They&rsquo;ll be in touch to finalize a written agreement. No payment was collected.</p>`,
    }).catch(() => {});
  }
  return Response.json({ ok: true });
}
