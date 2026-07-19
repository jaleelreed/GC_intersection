// Bid customization: cover note / inclusions / exclusions / terms / expiry
// round-trip through create → token view.
import { afterAll, describe, expect, it } from "vitest";
import { POST as INTAKE } from "../app/api/intake/[slug]/route";
import { createProposal, sendProposal, getProposalByToken } from "../lib/proposals/repo";
import { currentEstimateForLead } from "../lib/estimate/read";
import { getPool } from "../lib/db";
import { validPayload } from "./intake.schema.test";
import { cleanupSubmissions } from "./helpers/cleanup";

const d = describe.skipIf(!process.env.DATABASE_URL);
const ORG = "00000000-0000-4000-8000-000000000001";

d("bid customization", () => {
  afterAll(async () => {
    const pool = getPool();
    await pool.query(`
      DELETE FROM proposal_events WHERE proposal_id IN (
        SELECT p.id FROM proposals p JOIN estimate_versions v ON v.id = p.estimate_version_id
        JOIN estimates e ON e.id = v.estimate_id JOIN intake_submissions s ON s.id = e.intake_submission_id
        WHERE s.contact_email LIKE '%@bidcust-test.example')`);
    await pool.query(`
      DELETE FROM proposal_access_tokens WHERE proposal_id IN (
        SELECT p.id FROM proposals p JOIN estimate_versions v ON v.id = p.estimate_version_id
        JOIN estimates e ON e.id = v.estimate_id JOIN intake_submissions s ON s.id = e.intake_submission_id
        WHERE s.contact_email LIKE '%@bidcust-test.example')`);
    await pool.query(`
      DELETE FROM proposals WHERE estimate_version_id IN (
        SELECT v.id FROM estimate_versions v JOIN estimates e ON e.id = v.estimate_id
        JOIN intake_submissions s ON s.id = e.intake_submission_id WHERE s.contact_email LIKE '%@bidcust-test.example')`);
    await cleanupSubmissions(pool, "%@bidcust-test.example");
    await pool.end();
  });

  it("carries the cover note, inclusions/exclusions, terms, and expiry to the buyer view", async () => {
    const res = await INTAKE(
      new Request("http://t/i", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ...validPayload(), contact_email: "b@bidcust-test.example" }),
      }),
      { params: Promise.resolve({ slug: "fixture-link" }) }
    );
    const { id } = await res.json();
    const est = (await currentEstimateForLead(id, ORG))!;
    const { proposalId } = await createProposal({
      estimateVersionId: est.versionId,
      recipientName: "B",
      recipientEmail: "b@bidcust-test.example",
      customization: {
        coverNote: "Thanks for the opportunity!",
        inclusions: "Labor and materials for the bath",
        exclusions: "Permits, appliances",
        terms: "50% deposit, balance on completion",
      },
    });
    const { rawToken } = await sendProposal(proposalId, { expiresDays: 14 });

    const view = await getProposalByToken(rawToken);
    expect(view?.coverNote).toContain("opportunity");
    expect(view?.inclusions).toContain("bath");
    expect(view?.exclusions).toContain("Permits");
    expect(view?.terms).toContain("deposit");
    expect(view?.expiresAt).not.toBeNull();
    // ~14 days out
    const days = (new Date(view!.expiresAt!).getTime() - Date.now()) / 86_400_000;
    expect(days).toBeGreaterThan(13);
    expect(days).toBeLessThan(15);
  });
});
