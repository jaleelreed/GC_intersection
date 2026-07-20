// EP-05 engine: proposals as first-class timestamped events with a clean
// state machine (US-018), tokenized buyer access with hashes only (US-024),
// and THE D7 FREEZE: acceptance locks the estimate version at the database
// layer (US-025). D6: no payment objects exist, by design.
import { createHash, randomBytes } from "node:crypto";
import { getPool, setOrg, orgQuery } from "../db";
import { audit } from "../audit/repo";

// US-018/US-026: the machine. Decline is now DEFINED (Gap 7): a buyer may
// decline a proposal they have received (sent) or viewed; declining records
// the state + an optional reason, notifies the GC, and moves the lead to
// 'lost'. It is terminal and collects no payment (D6).
const TRANSITIONS: Record<string, string[]> = {
  draft: ["sent", "withdrawn"],
  sent: ["viewed", "accepted", "declined", "expired", "withdrawn"],
  viewed: ["accepted", "declined", "expired", "withdrawn"],
  accepted: [],
  declined: [],
  expired: [],
  withdrawn: [],
};

export class ProposalStateError extends Error {}

function assertTransition(from: string, to: string): void {
  if (!TRANSITIONS[from]?.includes(to)) {
    throw new ProposalStateError(`illegal proposal transition ${from} → ${to}`);
  }
}

const hashToken = (raw: string) => createHash("sha256").update(raw).digest("hex");

export interface BidCustomization {
  coverNote?: string;
  inclusions?: string;
  exclusions?: string;
  terms?: string;
}

export async function createProposal(args: {
  estimateVersionId: string;
  recipientName: string;
  recipientEmail: string;
  customization?: BidCustomization;
}): Promise<{ proposalId: string }> {
  const v = (
    await getPool().query(
      `SELECT v.id, v.org_id, e.project_id FROM estimate_versions v
       JOIN estimates e ON e.id = v.estimate_id
       WHERE v.id = $1 AND v.deleted_at IS NULL`,
      [args.estimateVersionId]
    )
  ).rows[0];
  if (!v) throw new Error("estimate version not found");
  const c = args.customization ?? {};
  const trim = (s?: string) => (s?.trim() ? s.trim().slice(0, 4000) : null);
  const r = await getPool().query(
    `INSERT INTO proposals (org_id, project_id, estimate_version_id, status, recipient_name, recipient_email,
       cover_note, inclusions, exclusions, terms)
     VALUES ($1, $2, $3, 'draft', $4, $5, $6, $7, $8, $9) RETURNING id`,
    [v.org_id, v.project_id, v.id, args.recipientName, args.recipientEmail,
     trim(c.coverNote), trim(c.inclusions), trim(c.exclusions), trim(c.terms)]
  );
  return { proposalId: r.rows[0].id };
}

/**
 * US-017/US-024: sending mints ONE access token; only its hash is stored.
 * The raw token is returned exactly once — it goes into the buyer link.
 */
export async function sendProposal(
  proposalId: string,
  opts: { expiresDays?: number } = {}
): Promise<{ rawToken: string }> {
  const client = await getPool().connect();
  try {
    await client.query("BEGIN");
    const p = (
      await client.query(`SELECT id, org_id, status FROM proposals WHERE id = $1 FOR UPDATE`, [proposalId])
    ).rows[0];
    if (!p) throw new Error("proposal not found");
    assertTransition(p.status, "sent");

    const rawToken = randomBytes(24).toString("base64url");
    await client.query(
      `INSERT INTO proposal_access_tokens (org_id, proposal_id, token_hash, expires_at)
       VALUES ($1, $2, $3, now() + make_interval(days => $4))`,
      [p.org_id, proposalId, hashToken(rawToken), opts.expiresDays ?? 30]
    );
    await client.query(
      `UPDATE proposals SET status = 'sent', sent_at = now(),
         expires_at = now() + make_interval(days => $2) WHERE id = $1`,
      [proposalId, opts.expiresDays ?? 30]
    );
    await client.query(
      `INSERT INTO proposal_events (org_id, proposal_id, event, actor_kind)
       VALUES ($1, $2, 'sent', 'gc_user')`,
      [p.org_id, proposalId]
    );
    await audit({ orgId: p.org_id, table: "proposals", rowId: proposalId, action: "sent" }, client);
    await client.query("COMMIT");
    return { rawToken };
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

export interface BuyerProposalView {
  proposalId: string;
  status: string;
  recipientName: string | null;
  grandTotal: string;
  rangeLow: string | null;
  rangeHigh: string | null;
  projectName: string;
  orgName: string;
  estimateVersionId: string;
  coverNote: string | null;
  inclusions: string | null;
  exclusions: string | null;
  terms: string | null;
  expiresAt: string | null;
}

export interface BidLine {
  description: string;
  total: string;
  is_allowance: boolean;
  is_alternate: boolean;
}

/**
 * US-016: the bid's line items for the buyer document. Token-authorized (the
 * token is the buyer's credential); returns owner-facing description + total,
 * never cost-code internals. Read-only, no state change.
 */
export async function bidLinesForToken(rawToken: string): Promise<BidLine[]> {
  const hash = hashToken(rawToken);
  // The token tables are not FORCE-RLS'd (the unguessable token is the buyer's
  // authorization); resolve the org from the token, then read the FORCE-RLS'd
  // estimate lines under that org's context.
  const org = (
    await getPool().query(
      `SELECT org_id FROM proposal_access_tokens
       WHERE token_hash = $1 AND revoked_at IS NULL AND expires_at > now() AND deleted_at IS NULL`,
      [hash]
    )
  ).rows[0];
  if (!org) return [];
  const r = await orgQuery<BidLine>(
    org.org_id,
    `SELECT l.description, l.total, l.is_allowance, l.is_alternate
     FROM proposal_access_tokens t
     JOIN proposals p ON p.id = t.proposal_id AND p.deleted_at IS NULL
     JOIN estimate_lines l ON l.estimate_version_id = p.estimate_version_id AND l.deleted_at IS NULL
     WHERE t.token_hash = $1 AND t.revoked_at IS NULL AND t.expires_at > now() AND t.deleted_at IS NULL
     ORDER BY l.is_alternate, l.sort_order`,
    [hash]
  );
  return r.rows;
}

/** Resolves a raw token → proposal; first view transitions sent → viewed. */
export async function getProposalByToken(rawToken: string): Promise<BuyerProposalView | null> {
  const client = await getPool().connect();
  try {
    await client.query("BEGIN");
    const t = (
      await client.query(
        `SELECT t.id AS token_id, t.proposal_id, t.org_id, p.status, p.recipient_name,
                p.estimate_version_id, v.grand_total, v.range_low, v.range_high,
                pr.name AS project_name, o.name AS org_name,
                p.cover_note, p.inclusions, p.exclusions, p.terms, p.expires_at
         FROM proposal_access_tokens t
         JOIN proposals p ON p.id = t.proposal_id AND p.deleted_at IS NULL
         JOIN estimate_versions v ON v.id = p.estimate_version_id
         JOIN projects pr ON pr.id = p.project_id
         JOIN organizations o ON o.id = p.org_id
         WHERE t.token_hash = $1 AND t.revoked_at IS NULL AND t.expires_at > now()
           AND t.deleted_at IS NULL
         FOR UPDATE OF p`,
        [hashToken(rawToken)]
      )
    ).rows[0];
    if (!t) {
      await client.query("ROLLBACK");
      return null;
    }
    let status = t.status;
    if (status === "sent") {
      assertTransition("sent", "viewed");
      status = "viewed";
      await client.query(`UPDATE proposals SET status = 'viewed' WHERE id = $1`, [t.proposal_id]);
      await client.query(
        `INSERT INTO proposal_events (org_id, proposal_id, event, actor_kind, actor_token_id)
         VALUES ($1, $2, 'viewed', 'buyer_token', $3)`,
        [t.org_id, t.proposal_id, t.token_id]
      );
    }
    await client.query("COMMIT");
    return {
      proposalId: t.proposal_id,
      status,
      recipientName: t.recipient_name,
      grandTotal: t.grand_total,
      rangeLow: t.range_low,
      rangeHigh: t.range_high,
      projectName: t.project_name,
      orgName: t.org_name,
      estimateVersionId: t.estimate_version_id,
      coverNote: t.cover_note,
      inclusions: t.inclusions,
      exclusions: t.exclusions,
      terms: t.terms,
      expiresAt: t.expires_at,
    };
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

/**
 * US-025: acceptance — a state change only (D6), and THE FREEZE (D7):
 * the accepted estimate version's locked_at is set in the same transaction;
 * from that moment the guard trigger refuses every write to its lines.
 * Idempotent: accepting an accepted proposal returns without change.
 */
export interface AcceptResult {
  accepted: boolean;
  orgId: string;
  recipientEmail: string | null;
  orgName: string;
  projectName: string;
}

export async function acceptProposal(rawToken: string): Promise<AcceptResult | null> {
  const client = await getPool().connect();
  try {
    await client.query("BEGIN");
    const t = (
      await client.query(
        `SELECT t.id AS token_id, t.proposal_id, t.org_id, p.status, p.estimate_version_id,
                p.recipient_email, o.name AS org_name, pr.name AS project_name
         FROM proposal_access_tokens t
         JOIN proposals p ON p.id = t.proposal_id AND p.deleted_at IS NULL
         JOIN organizations o ON o.id = p.org_id
         JOIN projects pr ON pr.id = p.project_id
         WHERE t.token_hash = $1 AND t.revoked_at IS NULL AND t.expires_at > now()
           AND t.deleted_at IS NULL
         FOR UPDATE OF p`,
        [hashToken(rawToken)]
      )
    ).rows[0];
    if (!t) {
      await client.query("ROLLBACK");
      return null;
    }
    const info = { orgId: t.org_id, recipientEmail: t.recipient_email, orgName: t.org_name, projectName: t.project_name };
    if (t.status === "accepted") {
      await client.query("COMMIT");
      return { accepted: true, ...info };
    }
    assertTransition(t.status, "accepted");

    await client.query(`UPDATE proposals SET status = 'accepted', accepted_at = now() WHERE id = $1`, [
      t.proposal_id,
    ]);
    await client.query(
      `UPDATE estimate_versions SET locked_at = now() WHERE id = $1 AND locked_at IS NULL`,
      [t.estimate_version_id]
    );
    await client.query(
      `INSERT INTO proposal_events (org_id, proposal_id, event, actor_kind, actor_token_id)
       VALUES ($1, $2, 'accepted', 'buyer_token', $3)`,
      [t.org_id, t.proposal_id, t.token_id]
    );
    await audit({ orgId: t.org_id, table: "proposals", rowId: t.proposal_id, action: "accepted" }, client);
    await client.query("COMMIT");
    return { accepted: true, ...info };
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Buyer asks the GC a question from the bid page. Token-authorized; notifies
 * the GC in-platform and records the event. Does not change proposal state.
 */
export async function askQuestion(rawToken: string, question: string): Promise<boolean> {
  const client = await getPool().connect();
  try {
    await client.query("BEGIN");
    const t = (
      await client.query(
        `SELECT t.id AS token_id, t.proposal_id, t.org_id
         FROM proposal_access_tokens t
         JOIN proposals p ON p.id = t.proposal_id AND p.deleted_at IS NULL
         WHERE t.token_hash = $1 AND t.revoked_at IS NULL AND t.expires_at > now()
           AND t.deleted_at IS NULL`,
        [hashToken(rawToken)]
      )
    ).rows[0];
    if (!t) {
      await client.query("ROLLBACK");
      return false;
    }
    await client.query(
      `INSERT INTO proposal_events (org_id, proposal_id, event, actor_kind, actor_token_id, meta)
       VALUES ($1, $2, 'viewed', 'buyer_token', $3, $4)`,
      [t.org_id, t.proposal_id, t.token_id, JSON.stringify({ question })]
    );
    await setOrg(client, t.org_id); // notifications is FORCE RLS
    await client.query(
      `INSERT INTO notifications (org_id, user_id, kind, subject_table, subject_id, title, body)
       SELECT m.org_id, m.user_id, 'buyer_question', 'proposals', $2, 'Question on a bid', $3
       FROM org_memberships m
       WHERE m.org_id = $1 AND m.is_active AND m.deleted_at IS NULL
         AND m.role IN ('owner_admin','project_manager')`,
      [t.org_id, t.proposal_id, question.slice(0, 500)]
    );
    await client.query("COMMIT");
    return true;
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

/**
 * US-026 (defined in Gap 7): the buyer declines. Terminal, no payment (D6).
 * Records the reason, notifies the GC, and moves the lead to 'lost'.
 * Idempotent: declining a declined proposal returns without change.
 */
export async function declineProposal(
  rawToken: string,
  reason?: string
): Promise<{ declined: boolean } | null> {
  const client = await getPool().connect();
  try {
    await client.query("BEGIN");
    const t = (
      await client.query(
        `SELECT t.id AS token_id, t.proposal_id, t.org_id, p.status, p.project_id
         FROM proposal_access_tokens t
         JOIN proposals p ON p.id = t.proposal_id AND p.deleted_at IS NULL
         WHERE t.token_hash = $1 AND t.revoked_at IS NULL AND t.expires_at > now()
           AND t.deleted_at IS NULL
         FOR UPDATE OF p`,
        [hashToken(rawToken)]
      )
    ).rows[0];
    if (!t) {
      await client.query("ROLLBACK");
      return null;
    }
    if (t.status === "declined") {
      await client.query("COMMIT");
      return { declined: true };
    }
    assertTransition(t.status, "declined");

    await client.query(`UPDATE proposals SET status = 'declined' WHERE id = $1`, [t.proposal_id]);
    await client.query(
      `INSERT INTO proposal_events (org_id, proposal_id, event, actor_kind, actor_token_id, meta)
       VALUES ($1, $2, 'declined', 'buyer_token', $3, $4)`,
      [t.org_id, t.proposal_id, t.token_id, JSON.stringify({ reason: reason ?? null })]
    );
    // Move the lead to 'lost' so the GC's pipeline reflects reality.
    if (t.project_id) {
      await client.query(
        `UPDATE intake_submissions SET pipeline_stage = 'lost', pipeline_updated_at = now()
         WHERE project_id = $1 AND org_id = $2`,
        [t.project_id, t.org_id]
      );
    }
    // Notify the GC in-platform (notifications is FORCE RLS — scope first).
    await setOrg(client, t.org_id);
    await client.query(
      `INSERT INTO notifications (org_id, user_id, kind, subject_table, subject_id, title, body)
       SELECT m.org_id, m.user_id, 'proposal_declined', 'proposals', $2,
              'Bid declined', $3
       FROM org_memberships m
       WHERE m.org_id = $1 AND m.is_active AND m.deleted_at IS NULL
         AND m.role IN ('owner_admin','project_manager')`,
      [t.org_id, t.proposal_id, reason ? `Reason: ${reason}` : "No reason given"]
    );
    await audit({ orgId: t.org_id, table: "proposals", rowId: t.proposal_id, action: "declined" }, client);
    await client.query("COMMIT");
    return { declined: true };
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

export interface ProposalRow {
  id: string;
  status: string;
  recipient_email: string | null;
  project_name: string;
  submission_id: string | null;
  grand_total: string;
  sent_at: string | null;
  accepted_at: string | null;
}

export async function listProposals(orgId: string): Promise<ProposalRow[]> {
  const r = await getPool().query(
    `SELECT p.id, p.status, p.recipient_email, pr.name AS project_name,
            e.intake_submission_id AS submission_id, v.grand_total,
            p.sent_at, p.accepted_at
     FROM proposals p
     JOIN estimate_versions v ON v.id = p.estimate_version_id
     JOIN estimates e ON e.id = v.estimate_id
     JOIN projects pr ON pr.id = p.project_id
     WHERE p.org_id = $1 AND p.deleted_at IS NULL
     ORDER BY p.created_at DESC`,
    [orgId]
  );
  return r.rows;
}

/** Resend: revoke the old token, mint a new one. Only for live proposals. */
export async function resendProposal(
  orgId: string,
  proposalId: string,
  expiresDays = 30
): Promise<{ rawToken: string } | null> {
  const client = await getPool().connect();
  try {
    await client.query("BEGIN");
    const p = (
      await client.query(
        `SELECT id, status FROM proposals WHERE id = $1 AND org_id = $2 AND deleted_at IS NULL FOR UPDATE`,
        [proposalId, orgId]
      )
    ).rows[0];
    if (!p || !["sent", "viewed"].includes(p.status)) {
      await client.query("ROLLBACK");
      return null;
    }
    await client.query(
      `UPDATE proposal_access_tokens SET revoked_at = now() WHERE proposal_id = $1 AND revoked_at IS NULL`,
      [proposalId]
    );
    const rawToken = randomBytes(24).toString("base64url");
    await client.query(
      `INSERT INTO proposal_access_tokens (org_id, proposal_id, token_hash, expires_at)
       VALUES ($1, $2, $3, now() + make_interval(days => $4))`,
      [orgId, proposalId, hashToken(rawToken), expiresDays]
    );
    await client.query("COMMIT");
    return { rawToken };
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

/** Withdraw a live proposal; revokes its tokens. */
export async function withdrawProposal(orgId: string, proposalId: string): Promise<boolean> {
  const client = await getPool().connect();
  try {
    await client.query("BEGIN");
    const p = (
      await client.query(
        `SELECT status FROM proposals WHERE id = $1 AND org_id = $2 AND deleted_at IS NULL FOR UPDATE`,
        [proposalId, orgId]
      )
    ).rows[0];
    if (!p) {
      await client.query("ROLLBACK");
      return false;
    }
    try {
      assertTransition(p.status, "withdrawn");
    } catch {
      await client.query("ROLLBACK");
      return false;
    }
    await client.query(`UPDATE proposals SET status = 'withdrawn' WHERE id = $1`, [proposalId]);
    await client.query(
      `UPDATE proposal_access_tokens SET revoked_at = now() WHERE proposal_id = $1 AND revoked_at IS NULL`,
      [proposalId]
    );
    await client.query(
      `INSERT INTO proposal_events (org_id, proposal_id, event, actor_kind)
       VALUES ($1, $2, 'withdrawn', 'gc_user')`,
      [orgId, proposalId]
    );
    await client.query("COMMIT");
    return true;
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}
