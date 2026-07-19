// Gap 7: decline path (US-026, now defined), resend, withdraw, list.
import { afterAll, describe, expect, it } from "vitest";
import { POST as INTAKE } from "../app/api/intake/[slug]/route";
import {
  createProposal,
  sendProposal,
  getProposalByToken,
  declineProposal,
  resendProposal,
  withdrawProposal,
  listProposals,
} from "../lib/proposals/repo";
import { currentEstimateForLead } from "../lib/estimate/read";
import { getPool } from "../lib/db";
import { validPayload } from "./intake.schema.test";
import { cleanupSubmissions } from "./helpers/cleanup";

const d = describe.skipIf(!process.env.DATABASE_URL);
const ORG = "00000000-0000-4000-8000-000000000001";

d("proposal management + decline", () => {
  afterAll(async () => {
    const pool = getPool();
    await pool.query(`
      DELETE FROM proposal_events WHERE proposal_id IN (
        SELECT p.id FROM proposals p JOIN estimate_versions v ON v.id = p.estimate_version_id
        JOIN estimates e ON e.id = v.estimate_id JOIN intake_submissions s ON s.id = e.intake_submission_id
        WHERE s.contact_email LIKE '%@mgmt-test.example')`);
    await pool.query(`
      DELETE FROM proposal_access_tokens WHERE proposal_id IN (
        SELECT p.id FROM proposals p JOIN estimate_versions v ON v.id = p.estimate_version_id
        JOIN estimates e ON e.id = v.estimate_id JOIN intake_submissions s ON s.id = e.intake_submission_id
        WHERE s.contact_email LIKE '%@mgmt-test.example')`);
    await pool.query(`
      DELETE FROM proposals WHERE estimate_version_id IN (
        SELECT v.id FROM estimate_versions v JOIN estimates e ON e.id = v.estimate_id
        JOIN intake_submissions s ON s.id = e.intake_submission_id WHERE s.contact_email LIKE '%@mgmt-test.example')`);
    await pool.query(`
      DELETE FROM notifications WHERE kind = 'proposal_declined' AND subject_id IN (
        SELECT p.id FROM proposals p JOIN estimate_versions v ON v.id = p.estimate_version_id
        JOIN estimates e ON e.id = v.estimate_id JOIN intake_submissions s ON s.id = e.intake_submission_id
        WHERE s.contact_email LIKE '%@mgmt-test.example')`);
    await cleanupSubmissions(pool, "%@mgmt-test.example");
    await pool.end();
  });

  async function draft(email: string) {
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
    return { versionId: est.versionId, submissionId: id };
  }

  it("decline: records status, moves the lead to lost, notifies the GC", async () => {
    const { versionId, submissionId } = await draft("d1@mgmt-test.example");
    const { proposalId } = await createProposal({ estimateVersionId: versionId, recipientName: "B", recipientEmail: "d1@mgmt-test.example" });
    const { rawToken } = await sendProposal(proposalId);
    await getProposalByToken(rawToken); // → viewed

    expect(await declineProposal(rawToken, "Went with someone else")).toEqual({ declined: true });
    // idempotent
    expect(await declineProposal(rawToken)).toEqual({ declined: true });

    const status = (await getPool().query(`SELECT status FROM proposals WHERE id = $1`, [proposalId])).rows[0].status;
    expect(status).toBe("declined");
    const stage = (await getPool().query(`SELECT pipeline_stage FROM intake_submissions WHERE id = $1`, [submissionId])).rows[0].pipeline_stage;
    expect(stage).toBe("lost");
    const notes = (await getPool().query(`SELECT count(*)::int AS n FROM notifications WHERE kind = 'proposal_declined' AND subject_id = $1`, [proposalId])).rows[0].n;
    expect(notes).toBeGreaterThanOrEqual(1);
  });

  it("resend revokes the old link and mints a new one; the old token stops working", async () => {
    const { versionId } = await draft("d2@mgmt-test.example");
    const { proposalId } = await createProposal({ estimateVersionId: versionId, recipientName: "B", recipientEmail: "d2@mgmt-test.example" });
    const { rawToken: first } = await sendProposal(proposalId);
    const resent = await resendProposal(ORG, proposalId);
    expect(resent).not.toBeNull();
    expect(await getProposalByToken(first)).toBeNull(); // old revoked
    expect(await getProposalByToken(resent!.rawToken)).not.toBeNull();
  });

  it("withdraw kills a live proposal and its tokens; listProposals shows it", async () => {
    const { versionId } = await draft("d3@mgmt-test.example");
    const { proposalId } = await createProposal({ estimateVersionId: versionId, recipientName: "B", recipientEmail: "d3@mgmt-test.example" });
    const { rawToken } = await sendProposal(proposalId);
    expect(await withdrawProposal(ORG, proposalId)).toBe(true);
    expect(await getProposalByToken(rawToken)).toBeNull();
    const list = await listProposals(ORG);
    expect(list.find((p) => p.id === proposalId)?.status).toBe("withdrawn");
  });
});
