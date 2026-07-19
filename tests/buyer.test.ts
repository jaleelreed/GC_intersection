// Buyer experience: ask a question (notifies GC) + accept returns recipient
// info for the confirmation email.
import { afterAll, describe, expect, it } from "vitest";
import { POST as INTAKE } from "../app/api/intake/[slug]/route";
import { createProposal, sendProposal, askQuestion, acceptProposal } from "../lib/proposals/repo";
import { currentEstimateForLead } from "../lib/estimate/read";
import { orgQuery } from "../lib/db";
import { validPayload } from "./intake.schema.test";
import { cleanupSubmissions } from "./helpers/cleanup";

const d = describe.skipIf(!process.env.DATABASE_URL);
const ORG = "00000000-0000-4000-8000-000000000001";

d("buyer experience", () => {
  afterAll(async () => {
    const pool = (await import("../lib/db")).getPool();
    await orgQuery(ORG, `DELETE FROM notifications WHERE org_id = $1 AND kind = 'buyer_question'`, [ORG]);
    await pool.query(`
      DELETE FROM proposal_events WHERE proposal_id IN (
        SELECT p.id FROM proposals p JOIN estimate_versions v ON v.id = p.estimate_version_id
        JOIN estimates e ON e.id = v.estimate_id JOIN intake_submissions s ON s.id = e.intake_submission_id
        WHERE s.contact_email LIKE '%@buyer-test.example')`);
    await pool.query(`
      DELETE FROM proposal_access_tokens WHERE proposal_id IN (
        SELECT p.id FROM proposals p JOIN estimate_versions v ON v.id = p.estimate_version_id
        JOIN estimates e ON e.id = v.estimate_id JOIN intake_submissions s ON s.id = e.intake_submission_id
        WHERE s.contact_email LIKE '%@buyer-test.example')`);
    await pool.query(`
      DELETE FROM proposals WHERE estimate_version_id IN (
        SELECT v.id FROM estimate_versions v JOIN estimates e ON e.id = v.estimate_id
        JOIN intake_submissions s ON s.id = e.intake_submission_id WHERE s.contact_email LIKE '%@buyer-test.example')`);
    await pool.query(`
      UPDATE estimate_versions SET locked_at = NULL WHERE id IN (
        SELECT v.id FROM estimate_versions v JOIN estimates e ON e.id = v.estimate_id
        JOIN intake_submissions s ON s.id = e.intake_submission_id WHERE s.contact_email LIKE '%@buyer-test.example')`);
    await cleanupSubmissions(pool, "%@buyer-test.example");
    await pool.end();
  });

  async function bidToken(email: string) {
    const res = await INTAKE(
      new Request("http://t/i", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ...validPayload(), contact_email: email }),
      }),
      { params: Promise.resolve({ slug: "fixture-link" }) }
    );
    const { id } = await res.json();
    const est = (await currentEstimateForLead(id, ORG))!;
    const { proposalId } = await createProposal({ estimateVersionId: est.versionId, recipientName: "B", recipientEmail: email });
    const { rawToken } = await sendProposal(proposalId);
    return { rawToken, proposalId };
  }

  it("a buyer question notifies the GC", async () => {
    const { rawToken, proposalId } = await bidToken("q@buyer-test.example");
    expect(await askQuestion(rawToken, "Does this include permits?")).toBe(true);
    const n = (
      await orgQuery(ORG, `SELECT body FROM notifications WHERE kind = 'buyer_question' AND subject_id = $1`, [proposalId])
    ).rows[0];
    expect(n.body).toContain("permits");
  });

  it("accept returns recipient + org info for the confirmation email", async () => {
    const { rawToken } = await bidToken("a@buyer-test.example");
    const r = await acceptProposal(rawToken);
    expect(r?.accepted).toBe(true);
    expect(r?.recipientEmail).toBe("a@buyer-test.example");
    expect(r?.orgName).toBeTruthy();
    expect(r?.orgId).toMatch(/^[0-9a-f-]{36}$/);
  });
});
