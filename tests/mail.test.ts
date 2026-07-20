// Gap 1: delivery is provider-gated. Without a provider, messages queue and
// the GC shares the link; the outbound_messages record is always written.
import { afterAll, describe, expect, it } from "vitest";
import { sendOutbound, proposalEmailHtml } from "../lib/mail/send";
import { getPool } from "../lib/db";

describe("proposalEmailHtml (pure)", () => {
  it("includes the buyer link and the fingerprint", () => {
    const html = proposalEmailHtml("Acme GC", "12 Main St", "https://x/p/tok");
    expect(html).toContain("https://x/p/tok");
    expect(html).toContain("Acme GC");
    expect(html).toContain("BidEasy");
  });
});

const d = describe.skipIf(!process.env.DATABASE_URL);

d("sendOutbound (default: no provider)", () => {
  const ids: string[] = [];
  afterAll(async () => {
    if (ids.length) await getPool().query(`DELETE FROM outbound_messages WHERE id = ANY($1)`, [ids]);
    await getPool().end();
  });

  it("queues and records when no mail provider is configured", async () => {
    // The CI/dev environment has no MAIL_PROVIDER — the default path.
    const { outcome } = await sendOutbound({
      orgId: "00000000-0000-4000-8000-000000000001",
      kind: "proposal_delivery",
      subjectTable: "proposals",
      subjectId: "00000000-0000-4000-8000-000000000001", // any uuid; no FK on subject_id
      recipientEmail: "buyer@example.com",
      subject: "Your estimate",
      html: "<p>hi</p>",
    });
    expect(outcome).toBe("queued");
    const row = (
      await getPool().query(
        `SELECT id, status, recipient_email FROM outbound_messages
         WHERE kind = 'proposal_delivery' AND recipient_email = 'buyer@example.com'
         ORDER BY created_at DESC LIMIT 1`
      )
    ).rows[0];
    ids.push(row.id);
    expect(row.status).toBe("queued");
  });
});
