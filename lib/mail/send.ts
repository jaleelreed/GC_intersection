// Outbound email, provider-gated (same doctrine as USE_LLM / CostProvider):
// with MAIL_PROVIDER=resend + RESEND_API_KEY + MAIL_FROM set, it sends; with
// nothing set — the default — it records the message as 'queued' and the GC
// shares the link by hand. No external account is required to ship; adding the
// key later flips real delivery on with no code change. Every attempt writes
// an outbound_messages row (the delivery record).
import type { PoolClient } from "pg";
import { getPool } from "../db";

export type DeliveryOutcome = "sent" | "queued" | "failed";

export interface OutboundArgs {
  orgId: string;
  kind: string; // 'proposal_delivery' | ...
  subjectTable: string;
  subjectId: string;
  recipientEmail: string;
  subject: string;
  html: string;
}

async function deliver(args: OutboundArgs): Promise<{ outcome: DeliveryOutcome; providerRef?: string; error?: string }> {
  const provider = process.env.MAIL_PROVIDER;
  const key = process.env.RESEND_API_KEY;
  const from = process.env.MAIL_FROM;

  if (provider !== "resend" || !key || !from) {
    // Default: no provider wired — the message is queued, GC shares the link.
    return { outcome: "queued" };
  }
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { authorization: `Bearer ${key}`, "content-type": "application/json" },
      body: JSON.stringify({ from, to: args.recipientEmail, subject: args.subject, html: args.html }),
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) return { outcome: "failed", error: `resend ${res.status}` };
    const data = (await res.json()) as { id?: string };
    return { outcome: "sent", providerRef: data.id };
  } catch (e) {
    return { outcome: "failed", error: (e as Error).message };
  }
}

/**
 * Records the outbound message and attempts delivery. Runs inside a caller's
 * transaction when a client is passed. Returns the outcome so the UI can tell
 * the GC whether to also copy the link.
 */
export async function sendOutbound(
  args: OutboundArgs,
  db?: PoolClient
): Promise<{ outcome: DeliveryOutcome }> {
  const runner = db ?? getPool();
  const result = await deliver(args);
  const status =
    result.outcome === "sent" ? "sent" : result.outcome === "failed" ? "failed" : "queued";
  await runner.query(
    `INSERT INTO outbound_messages
       (org_id, kind, subject_table, subject_id, recipient_email, status, provider, provider_ref, sent_at, error)
     VALUES ($1,$2,$3,$4,$5,$6::message_status,$7,$8, CASE WHEN $6 = 'sent' THEN now() ELSE NULL END, $9)`,
    [
      args.orgId,
      args.kind,
      args.subjectTable,
      args.subjectId,
      args.recipientEmail,
      status,
      process.env.MAIL_PROVIDER ?? null,
      result.providerRef ?? null,
      result.error ?? null,
    ]
  );
  return { outcome: result.outcome };
}

export function proposalEmailHtml(orgName: string, projectName: string, buyerUrl: string): string {
  return [
    `<p>${orgName} has prepared an estimate for ${projectName}.</p>`,
    `<p><a href="${buyerUrl}">View your estimate</a></p>`,
    `<p style="color:#64748b;font-size:12px">Prepared with GC_intersection</p>`,
  ].join("");
}
