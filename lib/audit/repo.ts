// Audit log: an append-only trail of the events that matter (lead created,
// converted, bid sent/accepted/declined, estimate edited). Best-effort — a
// logging failure must never break the business action.
import type { PoolClient } from "pg";
import { getPool, orgQuery } from "../db";

export interface AuditEvent {
  orgId: string;
  projectId?: string | null;
  table: string;
  rowId: string;
  action: string; // 'insert' | 'transition' | 'update' | ...
  actorUserId?: string | null;
  after?: unknown;
}

export async function audit(e: AuditEvent, db?: PoolClient): Promise<void> {
  const runner = db ?? getPool();
  try {
    await runner.query(
      `INSERT INTO audit_log (org_id, project_id, table_name, row_id, action, actor_user_id, after)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [e.orgId, e.projectId ?? null, e.table, e.rowId, e.action, e.actorUserId ?? null, e.after ? JSON.stringify(e.after) : null]
    );
  } catch {
    /* audit must never break the caller */
  }
}

export interface ActivityRow {
  action: string;
  table_name: string;
  occurred_at: string;
}

export async function recentActivity(orgId: string, limit = 20): Promise<ActivityRow[]> {
  const r = await orgQuery<ActivityRow>(
    orgId,
    `SELECT action, table_name, occurred_at FROM audit_log
     WHERE org_id = $1 ORDER BY occurred_at DESC LIMIT $2`,
    [orgId, limit]
  );
  return r.rows;
}

export interface Funnel {
  leads: number;
  quoted: number; // bids sent
  accepted: number;
  declined: number;
}

/** Activation funnel for the org, from audit + proposal state. */
export async function funnel(orgId: string): Promise<Funnel> {
  const leads = Number(
    (await orgQuery(
      orgId,
      `SELECT count(*)::int AS n FROM intake_submissions WHERE org_id = $1 AND status = 'converted' AND deleted_at IS NULL`,
      [orgId]
    )).rows[0].n
  );
  const p = (
    await orgQuery(
      orgId,
      `SELECT count(*) FILTER (WHERE status IN ('sent','viewed','accepted','declined'))::int AS quoted,
              count(*) FILTER (WHERE status = 'accepted')::int AS accepted,
              count(*) FILTER (WHERE status = 'declined')::int AS declined
       FROM proposals WHERE org_id = $1 AND deleted_at IS NULL`,
      [orgId]
    )
  ).rows[0];
  return { leads, quoted: p.quoted, accepted: p.accepted, declined: p.declined };
}
