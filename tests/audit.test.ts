// Audit log writes on key events; funnel reflects real state.
import { afterAll, describe, expect, it } from "vitest";
import { POST as INTAKE } from "../app/api/intake/[slug]/route";
import { createProposal, sendProposal, acceptProposal, getProposalByToken } from "../lib/proposals/repo";
import { currentEstimateForLead } from "../lib/estimate/read";
import { funnel, recentActivity } from "../lib/audit/repo";
import { getPool } from "../lib/db";
import { validPayload } from "./intake.schema.test";
import { cleanupSubmissions } from "./helpers/cleanup";

const d = describe.skipIf(!process.env.DATABASE_URL);
const ORG = "00000000-0000-4000-8000-000000000001";

d("audit + funnel", () => {
  afterAll(async () => {
    const pool = getPool();
    await pool.query(`
      DELETE FROM proposal_events WHERE proposal_id IN (
        SELECT p.id FROM proposals p JOIN estimate_versions v ON v.id = p.estimate_version_id
        JOIN estimates e ON e.id = v.estimate_id JOIN intake_submissions s ON s.id = e.intake_submission_id
        WHERE s.contact_email LIKE '%@audit-test.example')`);
    await pool.query(`
      DELETE FROM proposal_access_tokens WHERE proposal_id IN (
        SELECT p.id FROM proposals p JOIN estimate_versions v ON v.id = p.estimate_version_id
        JOIN estimates e ON e.id = v.estimate_id JOIN intake_submissions s ON s.id = e.intake_submission_id
        WHERE s.contact_email LIKE '%@audit-test.example')`);
    await pool.query(`
      DELETE FROM proposals WHERE estimate_version_id IN (
        SELECT v.id FROM estimate_versions v JOIN estimates e ON e.id = v.estimate_id
        JOIN intake_submissions s ON s.id = e.intake_submission_id WHERE s.contact_email LIKE '%@audit-test.example')`);
    await pool.query(`
      UPDATE estimate_versions SET locked_at = NULL WHERE id IN (
        SELECT v.id FROM estimate_versions v JOIN estimates e ON e.id = v.estimate_id
        JOIN intake_submissions s ON s.id = e.intake_submission_id WHERE s.contact_email LIKE '%@audit-test.example')`);
    await cleanupSubmissions(pool, "%@audit-test.example");
    await pool.end();
  });

  it("logs converted → sent → accepted and the funnel counts them", async () => {
    const before = await funnel(ORG);
    const res = await INTAKE(
      new Request("http://t/i", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ...validPayload(), contact_email: "a@audit-test.example" }),
      }),
      { params: Promise.resolve({ slug: "fixture-link" }) }
    );
    const { id } = await res.json();
    const est = (await currentEstimateForLead(id, ORG))!;
    const { proposalId } = await createProposal({ estimateVersionId: est.versionId, recipientName: "B", recipientEmail: "a@audit-test.example" });
    const { rawToken } = await sendProposal(proposalId);
    await getProposalByToken(rawToken);
    await acceptProposal(rawToken);

    const after = await funnel(ORG);
    expect(after.leads).toBeGreaterThan(before.leads);
    expect(after.quoted).toBeGreaterThan(before.quoted);
    expect(after.accepted).toBeGreaterThan(before.accepted);

    const actions = (await recentActivity(ORG, 50)).map((a) => a.action);
    expect(actions).toContain("converted");
    expect(actions).toContain("sent");
    expect(actions).toContain("accepted");
  });
});
