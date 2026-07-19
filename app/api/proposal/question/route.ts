// Buyer asks the GC a question. Public (token), rate-limited.
import { askQuestion } from "../../../../lib/proposals/repo";
import { rateGuard } from "../../../../lib/ratelimit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const limited = await rateGuard(req, "question", 15, 60);
  if (limited) return limited;

  let body: { token?: string; question?: string };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "bad body" }, { status: 400 });
  }
  const question = (body.question ?? "").trim();
  if (!body.token || !question) return Response.json({ error: "token and question required" }, { status: 400 });
  const ok = await askQuestion(body.token, question.slice(0, 1000));
  if (!ok) return Response.json({ error: "link is invalid or expired" }, { status: 404 });
  return Response.json({ ok: true });
}
