// Data export + workspace deletion (privacy controls). Owner-only, org-scoped.
import { getPool, orgQuery } from "../db";

/** Export the workspace's data as a plain object (JSON download). */
export async function exportWorkspace(orgId: string): Promise<Record<string, unknown>> {
  // Each read runs under the org's RLS context (cost_items is FORCE-RLS'd).
  const q = async (sql: string) => (await orgQuery(orgId, sql, [orgId])).rows;
  return {
    exported_at_note: "generated on request",
    organization: await q(`SELECT id, name, org_kind, created_at FROM organizations WHERE id = $1`),
    members: await q(
      `SELECT u.email, u.full_name, m.role FROM org_memberships m JOIN users u ON u.id = m.user_id WHERE m.org_id = $1 AND m.deleted_at IS NULL`
    ),
    intake_links: await q(`SELECT slug, channel, label, is_active FROM intake_links WHERE org_id = $1 AND deleted_at IS NULL`),
    submissions: await q(
      `SELECT address_line1, city, state, channel, pipeline_stage, submitted_at FROM intake_submissions WHERE org_id = $1 AND deleted_at IS NULL`
    ),
    estimates: await q(
      `SELECT e.name, e.class, v.version_no, v.grand_total, v.range_low, v.range_high
       FROM estimates e JOIN estimate_versions v ON v.estimate_id = e.id
       WHERE e.org_id = $1 AND e.deleted_at IS NULL ORDER BY e.created_at`
    ),
    learned_prices: await q(
      `SELECT c.code AS cost_code, ci.name, ci.uom, ci.sub_unit_cost AS unit_cost
       FROM cost_items ci LEFT JOIN cost_codes c ON c.id = ci.cost_code_id
       WHERE ci.org_id = $1 AND ci.source = 'harvested_bid' AND ci.deleted_at IS NULL`
    ),
  };
}

/**
 * Delete a workspace and everything under it. Hard delete inside one
 * transaction, children before parents. Irreversible.
 */
export async function deleteWorkspace(orgId: string): Promise<void> {
  const client = await getPool().connect();
  try {
    await client.query("BEGIN");
    await client.query(`SET LOCAL app.org_id = '${orgId}'`); // for FORCE-RLS children
    // FORCE-RLS tenant tables first (need the GUC).
    await client.query(`DELETE FROM lead_notes WHERE org_id = $1`, [orgId]);
    await client.query(`DELETE FROM notifications WHERE org_id = $1`, [orgId]);
    // Proposal chain.
    await client.query(`DELETE FROM proposal_events WHERE org_id = $1`, [orgId]);
    await client.query(`DELETE FROM proposal_access_tokens WHERE org_id = $1`, [orgId]);
    await client.query(`DELETE FROM proposals WHERE org_id = $1`, [orgId]);
    await client.query(`DELETE FROM outbound_messages WHERE org_id = $1`, [orgId]);
    // Estimate chain (null the circular pointer first).
    await client.query(`UPDATE intake_submissions SET estimate_id = NULL WHERE org_id = $1`, [orgId]);
    await client.query(`DELETE FROM estimate_generation_runs WHERE org_id = $1`, [orgId]);
    await client.query(`DELETE FROM estimate_lines WHERE org_id = $1`, [orgId]);
    await client.query(`DELETE FROM estimate_markups WHERE org_id = $1`, [orgId]);
    await client.query(`UPDATE estimates SET current_version_id = NULL WHERE org_id = $1`, [orgId]);
    await client.query(`DELETE FROM estimate_versions WHERE org_id = $1`, [orgId]);
    await client.query(`DELETE FROM estimates WHERE org_id = $1`, [orgId]);
    // Intake + enrichment + hints.
    await client.query(`DELETE FROM intake_scope_hints WHERE org_id = $1`, [orgId]);
    await client.query(`DELETE FROM intake_submissions WHERE org_id = $1`, [orgId]);
    await client.query(`DELETE FROM enrichment_snapshots WHERE org_id = $1`, [orgId]);
    await client.query(`DELETE FROM intake_links WHERE org_id = $1`, [orgId]);
    // Cost/config + benchmarks.
    await client.query(
      `DELETE FROM cost_items WHERE source_observation_id IN (SELECT id FROM benchmark_observations WHERE org_id = $1)`,
      [orgId]
    );
    await client.query(`DELETE FROM benchmark_observations WHERE org_id = $1`, [orgId]);
    await client.query(`DELETE FROM assembly_components WHERE org_id = $1`, [orgId]);
    await client.query(`DELETE FROM scope_assembly_map WHERE org_id = $1`, [orgId]);
    await client.query(`DELETE FROM assemblies WHERE org_id = $1`, [orgId]);
    await client.query(`DELETE FROM cost_items WHERE org_id = $1`, [orgId]);
    await client.query(`DELETE FROM assembly_modifiers WHERE org_id = $1`, [orgId]);
    await client.query(`DELETE FROM markup_templates WHERE org_id = $1`, [orgId]);
    await client.query(`DELETE FROM org_service_areas WHERE org_id = $1`, [orgId]);
    await client.query(`DELETE FROM ai_jobs WHERE org_id = $1`, [orgId]);
    await client.query(`DELETE FROM projects WHERE org_id = $1`, [orgId]);
    await client.query(`DELETE FROM org_memberships WHERE org_id = $1`, [orgId]);
    await client.query(`DELETE FROM organizations WHERE id = $1`, [orgId]);
    await client.query("COMMIT");
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
}
