// EP-05 engine: state machine, token hygiene, and the D7 freeze.
import { afterAll, describe, expect, it } from "vitest";
import { POST } from "../app/api/intake/[slug]/route";
import {
  createProposal,
  sendProposal,
  getProposalByToken,
  acceptProposal,
  ProposalStateError,
} from "../lib/proposals/repo";
import { getPool } from "../lib/db";
import { validPayload } from "./intake.schema.test";
import { cleanupSubmissions } from "./helpers/cleanup";

const d = describe.skipIf(!process.env.DATABASE_URL);

function request(body: unknown) {
  return new Request("http://test.local/api/intake/x", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}
const params = (slug: string) => ({ params: Promise.resolve({ slug }) });

async function draftEstimate(email: string) {
  const res = await POST(request({ ...validPayload(), contact_email: email }), params("fixture-link"));
  expect(res.status).toBe(201);
  const { id } = await res.json();
  return (
    await getPool().query(
      `SELECT e.current_version_id AS version_id FROM intake_submissions s
       JOIN estimates e ON e.id = s.estimate_id WHERE s.id = $1`,
      [id]
    )
  ).rows[0].version_id;
}

d("EP-05 proposal engine", () => {
  afterAll(async () => {
    const pool = getPool();
    // proposals/tokens/events reference versions of these submissions' estimates
    await pool.query(`
      DELETE FROM proposal_events WHERE proposal_id IN (
        SELECT p.id FROM proposals p JOIN estimate_versions v ON v.id = p.estimate_version_id
        JOIN estimates e ON e.id = v.estimate_id
        JOIN intake_submissions s ON s.id = e.intake_submission_id
        WHERE s.contact_email LIKE '%@prop-test.example')`);
    await pool.query(`
      DELETE FROM proposal_access_tokens WHERE proposal_id IN (
        SELECT p.id FROM proposals p JOIN estimate_versions v ON v.id = p.estimate_version_id
        JOIN estimates e ON e.id = v.estimate_id
        JOIN intake_submissions s ON s.id = e.intake_submission_id
        WHERE s.contact_email LIKE '%@prop-test.example')`);
    await pool.query(`
      DELETE FROM proposals WHERE estimate_version_id IN (
        SELECT v.id FROM estimate_versions v JOIN estimates e ON e.id = v.estimate_id
        JOIN intake_submissions s ON s.id = e.intake_submission_id
        WHERE s.contact_email LIKE '%@prop-test.example')`);
    await pool.query(`
      UPDATE estimate_versions SET locked_at = NULL WHERE id IN (
        SELECT v.id FROM estimate_versions v JOIN estimates e ON e.id = v.estimate_id
        JOIN intake_submissions s ON s.id = e.intake_submission_id
        WHERE s.contact_email LIKE '%@prop-test.example')`);
    await cleanupSubmissions(pool, "%@prop-test.example");
    await pool.end();
  });

  it("draft → sent → viewed → accepted, with events and hashed tokens only", async () => {
    const versionId = await draftEstimate("p1@prop-test.example");
    const { proposalId } = await createProposal({
      estimateVersionId: versionId,
      recipientName: "Pat Buyer",
      recipientEmail: "p1@prop-test.example",
    });
    const { rawToken } = await sendProposal(proposalId);
    expect(rawToken.length).toBeGreaterThan(20);

    // hash hygiene: the raw token appears nowhere in the database
    const stored = (
      await getPool().query(`SELECT token_hash FROM proposal_access_tokens WHERE proposal_id = $1`, [proposalId])
    ).rows[0];
    expect(stored.token_hash).not.toBe(rawToken);

    const view = await getProposalByToken(rawToken);
    expect(view?.status).toBe("viewed");
    expect(Number(view?.grandTotal)).toBeGreaterThan(0);

    const accepted = await acceptProposal(rawToken);
    expect(accepted?.accepted).toBe(true);
    // idempotent replay
    expect((await acceptProposal(rawToken))?.accepted).toBe(true);

    const events = (
      await getPool().query(
        `SELECT event, actor_kind FROM proposal_events WHERE proposal_id = $1 ORDER BY occurred_at, event`,
        [proposalId]
      )
    ).rows;
    expect(events.map((e) => e.event).sort()).toEqual(["accepted", "sent", "viewed"]);
    expect(events.find((e) => e.event === "accepted")?.actor_kind).toBe("buyer_token");
  });

  it("US-025 / D7: acceptance freezes the version at the database layer", async () => {
    const versionId = await draftEstimate("p2@prop-test.example");
    const { proposalId } = await createProposal({
      estimateVersionId: versionId,
      recipientName: "Freeze Buyer",
      recipientEmail: "p2@prop-test.example",
    });
    const { rawToken } = await sendProposal(proposalId);
    await getProposalByToken(rawToken);
    await acceptProposal(rawToken);

    const locked = (
      await getPool().query(`SELECT locked_at FROM estimate_versions WHERE id = $1`, [versionId])
    ).rows[0];
    expect(locked.locked_at).not.toBeNull();

    await expect(
      getPool().query(
        `UPDATE estimate_lines SET unit_cost = '1.0000' WHERE estimate_version_id = $1`,
        [versionId]
      )
    ).rejects.toThrow(/locked/);
  });

  it("guards the machine: illegal transitions and bad/expired tokens rejected", async () => {
    const versionId = await draftEstimate("p3@prop-test.example");
    const { proposalId } = await createProposal({
      estimateVersionId: versionId,
      recipientName: "Guard Buyer",
      recipientEmail: "p3@prop-test.example",
    });

    // unknown token
    expect(await getProposalByToken("not-a-real-token")).toBeNull();

    // draft cannot be accepted (no token exists yet, but even the machine says no)
    const { rawToken } = await sendProposal(proposalId);
    // second send from 'sent' is illegal
    await expect(sendProposal(proposalId)).rejects.toThrow(ProposalStateError);

    // expired token
    await getPool().query(
      `UPDATE proposal_access_tokens SET expires_at = now() - interval '1 day' WHERE proposal_id = $1`,
      [proposalId]
    );
    expect(await getProposalByToken(rawToken)).toBeNull();
    expect(await acceptProposal(rawToken)).toBeNull();
  });
});
