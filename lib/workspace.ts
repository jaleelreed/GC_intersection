// Maps an authenticated identity (email) onto the platform's own tenancy
// (users + org_memberships). Auth knows who you are; this knows where you
// work. Unknown emails get an honest "no workspace" instead of a silent org —
// auto-provisioning a new GC org is its own story (onboarding).
import { getPool } from "./db";

export interface Workspace {
  userId: string;
  orgId: string;
  orgName: string;
  role: string;
}

export async function resolveWorkspace(email: string): Promise<Workspace | null> {
  const r = await getPool().query(
    `SELECT u.id AS user_id, m.org_id, m.role, o.name AS org_name
     FROM users u
     JOIN org_memberships m ON m.user_id = u.id AND m.is_active AND m.deleted_at IS NULL
     JOIN organizations o ON o.id = m.org_id AND o.deleted_at IS NULL
     WHERE lower(u.email) = lower($1) AND u.deleted_at IS NULL
     ORDER BY m.created_at
     LIMIT 1`,
    [email]
  );
  const row = r.rows[0];
  if (!row) return null;
  return { userId: row.user_id, orgId: row.org_id, orgName: row.org_name, role: row.role };
}
