// US-005: public intake submission endpoint. Validates against the contract
// schema, snapshots channel/org from the link, applies the spam floor.
import { intakeSubmissionSchema, isSpam } from "../../../../lib/intake/schema";
import { findActiveLink, insertSubmission } from "../../../../lib/intake/repo";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(
  req: Request,
  ctx: { params: Promise<{ slug: string }> }
) {
  const { slug } = await ctx.params;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ errors: [{ path: "", message: "invalid JSON" }] }, { status: 400 });
  }

  const parsed = intakeSubmissionSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      {
        errors: parsed.error.issues.map((i) => ({
          path: i.path.join("."),
          message: i.message,
        })),
      },
      { status: 422 }
    );
  }

  const link = await findActiveLink(slug);
  if (!link) {
    return Response.json({ errors: [{ path: "", message: "unknown form" }] }, { status: 404 });
  }

  // Spam is stored (status='spam'), never surfaced to the submitter.
  const status = isSpam(parsed.data, Date.now()) ? "spam" : "submitted";
  const { id } = await insertSubmission(link, parsed.data, status);

  return Response.json({ id }, { status: 201 });
}
