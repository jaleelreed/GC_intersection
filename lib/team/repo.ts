// Gap 8: team management. Invite by email (no email send needed — the person
// signs in with that email via OTP and lands in the shared workspace, because
// resolveWorkspace maps email → membership). Remove revokes access.
import { getPool } from "../db";

export type OrgRole = "owner_admin" | "project_manager" | "accounting" | "field" | "read_only";

export interface Member {
  membership_id: string;
  user_id: string;
  email: string;
  full_name: string | null;
  role: OrgRole;
  is_self: boolean;
}

export async function listMembers(orgId: string, selfUserId: string): Promise<Member[]> {
  const r = await getPool().query(
    `SELECT m.id AS membership_id, u.id AS user_id, u.email, u.full_name, m.role
     FROM org_memberships m
     JOIN users u ON u.id = m.user_id AND u.deleted_at IS NULL
     WHERE m.org_id = $1 AND m.is_active AND m.deleted_at IS NULL
     ORDER BY m.created_at`,
    [orgId]
  );
  return r.rows.map((row) => ({ ...row, is_self: row.user_id === selfUserId }));
}

/**
 * Invite by email: ensure a user row exists for the email, then attach a
 * membership. Idempotent (re-inviting an existing member is a no-op).
 * Returns 'added' | 'existing'.
 */
export async function addMember(
  orgId: string,
  email: string,
  role: OrgRole = "project_manager"
): Promise<"added" | "existing"> {
  const client = await getPool().connect();
  try {
    await client.query("BEGIN");
    let userId = (
      await client.query(`SELECT id FROM users WHERE lower(email) = lower($1) AND deleted_at IS NULL`, [email])
    ).rows[0]?.id;
    if (!userId) {
      userId = (
        await client.query(`INSERT INTO users (email, full_name) VALUES ($1, $1) RETURNING id`, [email])
      ).rows[0].id;
    }
    const existing = (
      await client.query(
        `SELECT id, is_active FROM org_memberships WHERE org_id = $1 AND user_id = $2`,
        [orgId, userId]
      )
    ).rows[0];
    if (existing) {
      if (!existing.is_active) {
        await client.query(`UPDATE org_memberships SET is_active = true, deleted_at = NULL WHERE id = $1`, [existing.id]);
        await client.query("COMMIT");
        return "added";
      }
      await client.query("COMMIT");
      return "existing";
    }
    await client.query(
      `INSERT INTO org_memberships (org_id, user_id, role) VALUES ($1, $2, $3)`,
      [orgId, userId, role]
    );
    await client.query("COMMIT");
    return "added";
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
}

/** Remove a member. Cannot remove yourself. Returns false if not found/self. */
export async function removeMember(
  orgId: string,
  membershipId: string,
  selfUserId: string
): Promise<boolean> {
  const r = await getPool().query(
    `UPDATE org_memberships SET is_active = false, deleted_at = now()
     WHERE id = $1 AND org_id = $2 AND user_id <> $3 AND deleted_at IS NULL`,
    [membershipId, orgId, selfUserId]
  );
  return (r.rowCount ?? 0) > 0;
}
