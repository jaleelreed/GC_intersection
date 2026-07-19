// EP-05 engine: proposals as first-class timestamped events with a clean
// state machine (US-018), tokenized buyer access with hashes only (US-024),
// and THE D7 FREEZE: acceptance locks the estimate version at the database
// layer (US-025). D6: no payment objects exist, by design.
import { createHash, randomBytes } from "node:crypto";
import { getPool } from "../db";

// US-018: the machine. 'declined' exists as a state but has NO transition
// here — US-026 is parked until the decline path is defined. Do not add it.
const TRANSITIONS: Record<string, string[]> = {
  draft: ["sent", "withdrawn"],
  sent: ["viewed", "expired", "withdrawn"],
  viewed: ["accepted", "expired", "withdrawn"],
  accepted: [],
  expired: [],
  withdrawn: [],
};

export class ProposalStateError extends Error {}

function assertTransition(from: string, to: string): void {
  if (to === "declined") {
    throw new ProposalStateError(
      "decline path is undefined (US-026 parked) — no workflow may transition to 'declined'"
    );
  }
  if (!TRANSITIONS[from]?.includes(to)) {
    throw new ProposalStateError(`illegal proposal transition ${from} → ${to}`);
  }
}

const hashToken = (raw: string) => createHash("sha256").update(raw).digest("hex");

export async function createProposal(args: {
  estimateVersionId: string;
  recipientName: string;
  recipientEmail: string;
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
  const r = await getPool().query(
    `INSERT INTO proposals (org_id, project_id, estimate_version_id, status, recipient_name, recipient_email)
     VALUES ($1, $2, $3, 'draft', $4, $5) RETURNING id`,
    [v.org_id, v.project_id, v.id, args.recipientName, args.recipientEmail]
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
    await client.query(`UPDATE proposals SET status = 'sent', sent_at = now() WHERE id = $1`, [proposalId]);
    await client.query(
      `INSERT INTO proposal_events (org_id, proposal_id, event, actor_kind)
       VALUES ($1, $2, 'sent', 'gc_user')`,
      [p.org_id, proposalId]
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

export interface BuyerProposalView {
  proposalId: string;
  status: string;
  recipientName: string | null;
  grandTotal: string;
  rangeLow: string | null;
  rangeHigh: string | null;
  projectName: string;
}

/** Resolves a raw token → proposal; first view transitions sent → viewed. */
export async function getProposalByToken(rawToken: string): Promise<BuyerProposalView | null> {
  const client = await getPool().connect();
  try {
    await client.query("BEGIN");
    const t = (
      await client.query(
        `SELECT t.id AS token_id, t.proposal_id, t.org_id, p.status, p.recipient_name,
                v.grand_total, v.range_low, v.range_high, pr.name AS project_name
         FROM proposal_access_tokens t
         JOIN proposals p ON p.id = t.proposal_id AND p.deleted_at IS NULL
         JOIN estimate_versions v ON v.id = p.estimate_version_id
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
export async function acceptProposal(rawToken: string): Promise<{ accepted: boolean } | null> {
  const client = await getPool().connect();
  try {
    await client.query("BEGIN");
    const t = (
      await client.query(
        `SELECT t.id AS token_id, t.proposal_id, t.org_id, p.status, p.estimate_version_id
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
    if (t.status === "accepted") {
      await client.query("COMMIT");
      return { accepted: true };
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
    await client.query("COMMIT");
    return { accepted: true };
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}
