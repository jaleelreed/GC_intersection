// US-005: public intake submission endpoint. Validates against the contract
// schema, snapshots channel/org from the link, applies the spam floor.
import { intakeSubmissionSchema, isSpam } from "../../../../lib/intake/schema";
import { findActiveLink, insertSubmission } from "../../../../lib/intake/repo";
import { convertSubmission } from "../../../../lib/intake/convert";
import { checkRateLimit, clientKey, tooMany } from "../../../../lib/ratelimit";
import { captureError } from "../../../../lib/monitor";
import { deriveCountyFips } from "../../../../lib/enrichment/county";
import { FixtureEnrichmentProvider } from "../../../../lib/enrichment/provider";
import { storeSnapshot } from "../../../../lib/enrichment/repo";

const enrichment = new FixtureEnrichmentProvider();

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(
  req: Request,
  ctx: { params: Promise<{ slug: string }> }
) {
  const rl = await checkRateLimit("intake", clientKey(req), 20, 60, Date.now());
  if (!rl.allowed) return tooMany();

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

  // US-005c: derive the county that keys the market seed (null = unknown =
  // the range widens; never guessed), and snapshot enrichment. An empty
  // extract is the normal state; a snapshot failure never blocks a lead.
  const county_fips = deriveCountyFips(parsed.data.postal_code);
  let enrichment_snapshot_id: string | null = null;
  try {
    const result = await enrichment.enrich({
      line1: parsed.data.address_line1,
      city: parsed.data.city,
      state: parsed.data.state,
      postal_code: parsed.data.postal_code,
    });
    enrichment_snapshot_id = await storeSnapshot(
      link.org_id,
      `${parsed.data.address_line1}, ${parsed.data.city} ${parsed.data.state} ${parsed.data.postal_code}`.toLowerCase(),
      result
    );
  } catch (err) {
    console.error("enrichment failed (lead proceeds)", { err });
  }

  const { id } = await insertSubmission(link, parsed.data, status, {
    county_fips,
    enrichment_snapshot_id,
  });

  // US-007: conversion runs after the submission is safely stored. A failure
  // here leaves the submission 'submitted' (retryable) — the homeowner still
  // gets success; the lead is never lost.
  if (status === "submitted") {
    try {
      await convertSubmission(id);
    } catch (err) {
      await captureError(err, { where: "intake.convert", submission_id: id });
    }
  }

  return Response.json({ id }, { status: 201 });
}
