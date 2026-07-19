// Alternates & allowances: flagging a line alternate excludes it from the
// total; allowance stays in. Flags reach the buyer view.
import { afterAll, describe, expect, it } from "vitest";
import { POST as INTAKE } from "../app/api/intake/[slug]/route";
import { editIntoNewVersion } from "../lib/estimate/edit";
import { currentEstimateForLead } from "../lib/estimate/read";
import { createProposal, sendProposal, bidLinesForToken } from "../lib/proposals/repo";
import { getPool } from "../lib/db";
import { validPayload } from "./intake.schema.test";
import { cleanupSubmissions } from "./helpers/cleanup";

const d = describe.skipIf(!process.env.DATABASE_URL);
const ORG = "00000000-0000-4000-8000-000000000001";

d("alternates & allowances", () => {
  afterAll(async () => {
    const pool = getPool();
    await pool.query(`
      DELETE FROM proposal_events WHERE proposal_id IN (
        SELECT p.id FROM proposals p JOIN estimate_versions v ON v.id = p.estimate_version_id
        JOIN estimates e ON e.id = v.estimate_id JOIN intake_submissions s ON s.id = e.intake_submission_id
        WHERE s.contact_email LIKE '%@alt-test.example')`);
    await pool.query(`
      DELETE FROM proposal_access_tokens WHERE proposal_id IN (
        SELECT p.id FROM proposals p JOIN estimate_versions v ON v.id = p.estimate_version_id
        JOIN estimates e ON e.id = v.estimate_id JOIN intake_submissions s ON s.id = e.intake_submission_id
        WHERE s.contact_email LIKE '%@alt-test.example')`);
    await pool.query(`
      DELETE FROM proposals WHERE estimate_version_id IN (
        SELECT v.id FROM estimate_versions v JOIN estimates e ON e.id = v.estimate_id
        JOIN intake_submissions s ON s.id = e.intake_submission_id WHERE s.contact_email LIKE '%@alt-test.example')`);
    await cleanupSubmissions(pool, "%@alt-test.example");
    await pool.end();
  });

  it("marking a line alternate drops it from the base total; buyer sees the flags", async () => {
    const res = await INTAKE(
      new Request("http://t/i", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ...validPayload(), contact_email: "a@alt-test.example" }),
      }),
      { params: Promise.resolve({ slug: "fixture-link" }) }
    );
    const { id } = await res.json();
    const est = (await currentEstimateForLead(id, ORG))!;
    const before = Number(est.grandTotal);
    const victim = est.lines[0];
    const victimTotal = Number(victim.total);

    const { newVersionId } = await editIntoNewVersion(est.versionId, [], {
      flags: [{ lineage_id: victim.lineage_id, is_alternate: true }],
    });

    const after = (
      await getPool().query(`SELECT base_total, grand_total FROM estimate_versions WHERE id = $1`, [newVersionId])
    ).rows[0];
    // base dropped by roughly the victim's total (markups scale it, so assert lower)
    expect(Number(after.base_total)).toBeLessThan(before);
    expect(Number(after.base_total)).toBeCloseTo(
      Number((est.lines.reduce((s, l) => s + Number(l.total), 0) - victimTotal).toFixed(2)),
      1
    );

    // buyer view carries the alternate flag
    const { proposalId } = await createProposal({
      estimateVersionId: newVersionId,
      recipientName: "B",
      recipientEmail: "a@alt-test.example",
    });
    const { rawToken } = await sendProposal(proposalId);
    const lines = await bidLinesForToken(rawToken);
    expect(lines.some((l) => l.is_alternate)).toBe(true);
  });
});
