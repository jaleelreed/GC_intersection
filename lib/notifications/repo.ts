// US-008: in-platform notification inbox. audit_log is not an inbox.
import type { PoolClient } from "pg";
import { orgQuery } from "../db";

export interface NotificationRow {
  id: string;
  kind: string;
  subject_table: string;
  subject_id: string;
  title: string;
  body: string | null;
  read_at: string | null;
  created_at: string;
}

/**
 * Fans out one notification per active owner_admin / project_manager
 * membership of the org. Runs inside the caller's transaction; the caller
 * MUST have set app.org_id on the client (notifications is FORCE RLS).
 */
export async function notifyOrg(
  db: PoolClient,
  orgId: string,
  n: { kind: string; subject_table: string; subject_id: string; title: string; body?: string }
): Promise<number> {
  const r = await db.query(
    `INSERT INTO notifications (org_id, user_id, kind, subject_table, subject_id, title, body)
     SELECT m.org_id, m.user_id, $2, $3, $4, $5, $6
     FROM org_memberships m
     WHERE m.org_id = $1 AND m.is_active AND m.deleted_at IS NULL
       AND m.role IN ('owner_admin', 'project_manager')`,
    [orgId, n.kind, n.subject_table, n.subject_id, n.title, n.body ?? null]
  );
  return r.rowCount ?? 0;
}

export async function inbox(
  orgId: string,
  userId: string,
  opts: { unreadOnly?: boolean; limit?: number } = {}
): Promise<NotificationRow[]> {
  const r = await orgQuery<NotificationRow>(
    orgId,
    `SELECT id, kind, subject_table, subject_id, title, body, read_at, created_at
     FROM notifications
     WHERE org_id = $1 AND user_id = $2 AND deleted_at IS NULL
       ${opts.unreadOnly ? "AND read_at IS NULL" : ""}
     ORDER BY created_at DESC
     LIMIT $3`,
    [orgId, userId, opts.limit ?? 50]
  );
  return r.rows;
}

export async function markRead(orgId: string, id: string, userId: string): Promise<boolean> {
  const r = await orgQuery(
    orgId,
    `UPDATE notifications SET read_at = now()
     WHERE id = $1 AND user_id = $2 AND read_at IS NULL AND deleted_at IS NULL`,
    [id, userId]
  );
  return (r.rowCount ?? 0) > 0;
}
