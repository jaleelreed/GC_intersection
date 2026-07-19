// Gap 8: team invite/remove, org-scoped, using a throwaway org.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ensureWorkspace } from "../lib/onboarding/provision";
import { listMembers, addMember, removeMember } from "../lib/team/repo";
import { resolveWorkspace } from "../lib/workspace";
import { getPool } from "../lib/db";

const d = describe.skipIf(!process.env.DATABASE_URL);

d("team management", () => {
  const owner = `owner+${Date.now()}@team-test.example`;
  const mate = `mate+${Date.now()}@team-test.example`;
  let orgId = "";
  let ownerUserId = "";

  beforeAll(async () => {
    const ws = await ensureWorkspace(owner, "Team Owner");
    orgId = ws.orgId;
    ownerUserId = ws.userId;
  });

  afterAll(async () => {
    const pool = getPool();
    for (const t of ["assembly_components", "scope_assembly_map", "assemblies", "cost_items", "assembly_modifiers", "markup_templates", "intake_links"]) {
      await pool.query(`DELETE FROM ${t} WHERE org_id = $1`, [orgId]);
    }
    await pool.query(`DELETE FROM org_memberships WHERE org_id = $1`, [orgId]);
    await pool.query(`DELETE FROM users WHERE lower(email) IN (lower($1), lower($2))`, [owner, mate]);
    await pool.query(`DELETE FROM organizations WHERE id = $1`, [orgId]);
    await pool.end();
  });

  it("invite by email adds a member; re-invite is a no-op", async () => {
    expect(await addMember(orgId, mate)).toBe("added");
    expect(await addMember(orgId, mate)).toBe("existing");
    const members = await listMembers(orgId, ownerUserId);
    expect(members.some((m) => m.email.toLowerCase() === mate.toLowerCase())).toBe(true);
    // the invited email now resolves to this workspace on sign-in
    expect((await resolveWorkspace(mate))?.orgId).toBe(orgId);
  });

  it("cannot remove yourself; can remove a teammate", async () => {
    const members = await listMembers(orgId, ownerUserId);
    const self = members.find((m) => m.is_self)!;
    const other = members.find((m) => !m.is_self)!;
    expect(await removeMember(orgId, self.membership_id, ownerUserId)).toBe(false);
    expect(await removeMember(orgId, other.membership_id, ownerUserId)).toBe(true);
    expect((await resolveWorkspace(mate))).toBeNull(); // access revoked
  });
});
