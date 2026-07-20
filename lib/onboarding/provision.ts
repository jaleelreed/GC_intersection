// Onboarding: a brand-new verified identity gets a working workspace on
// first sign-in — org, membership, an intake link, and a private copy of the
// starter estimating config so their very first draft prices (X-1 zero-setup:
// never show them a blank sheet). Idempotent; safe to call on every sign-in.
//
// The starter config is CLONED from a template org (the seeded fixture org)
// rather than re-declared here, so there is one source of truth for the
// catalog/assemblies/modifiers. Cost data never crosses orgs — only the
// neutral structure is copied; the numbers become the new org's own to edit.
import { randomBytes } from "node:crypto";
import type { PoolClient } from "pg";
import { getPool, setOrg, withOrg } from "../db";
import type { Workspace } from "../workspace";

const TEMPLATE_ORG_ID = "00000000-0000-4000-8000-000000000001";

// cost_items is FORCE-RLS'd, so the template catalog must be read under the
// TEMPLATE org's context; the new org's rows are then written under the new
// org's context (set on the provisioning client). The other cloned tables are
// not FORCE'd, so their cross-org copy still works under the new org's context.
async function readTemplateCostItems(fromOrg: string): Promise<Record<string, unknown>[]> {
  return withOrg(fromOrg, async (c) =>
    (
      await c.query(
        `SELECT id, code, name, cost_code_id, uom, labor_unit_cost, material_unit_cost,
                equipment_unit_cost, sub_unit_cost, productivity_rate, msa_code
         FROM cost_items
         WHERE org_id = $1 AND source = 'manual' AND deleted_at IS NULL`,
        [fromOrg]
      )
    ).rows
  );
}

async function cloneEstimatingConfig(
  client: PoolClient,
  fromOrg: string,
  toOrg: string,
  catalog: Record<string, unknown>[]
): Promise<void> {
  // cost_items catalog (manual rows only — never harvested/learned costs),
  // prefetched from the template under its own org context.
  const costItemMap = new Map<string, string>();
  for (const c of catalog as Array<Record<string, string>>) {
    const r = await client.query(
      `INSERT INTO cost_items (org_id, code, name, cost_code_id, uom, labor_unit_cost,
         material_unit_cost, equipment_unit_cost, sub_unit_cost, productivity_rate, source, msa_code)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'manual',$11) RETURNING id`,
      [toOrg, c.code, c.name, c.cost_code_id, c.uom, c.labor_unit_cost, c.material_unit_cost,
       c.equipment_unit_cost, c.sub_unit_cost, c.productivity_rate, c.msa_code]
    );
    costItemMap.set(c.id, r.rows[0].id);
  }

  // assemblies + their components (remapped to the cloned cost_items).
  const assemblyMap = new Map<string, string>();
  const assemblies = (
    await client.query(
      `SELECT id, name, description, uom, parameters FROM assemblies
       WHERE org_id = $1 AND deleted_at IS NULL`,
      [fromOrg]
    )
  ).rows;
  for (const a of assemblies) {
    const r = await client.query(
      `INSERT INTO assemblies (org_id, name, description, uom, parameters)
       VALUES ($1,$2,$3,$4,$5) RETURNING id`,
      [toOrg, a.name, a.description, a.uom, a.parameters]
    );
    assemblyMap.set(a.id, r.rows[0].id);
  }
  const components = (
    await client.query(
      `SELECT assembly_id, cost_item_id, quantity_formula, waste_pct FROM assembly_components
       WHERE org_id = $1 AND deleted_at IS NULL`,
      [fromOrg]
    )
  ).rows;
  for (const c of components) {
    const newAssembly = assemblyMap.get(c.assembly_id);
    const newCostItem = costItemMap.get(c.cost_item_id);
    if (!newAssembly || !newCostItem) continue;
    await client.query(
      `INSERT INTO assembly_components (org_id, assembly_id, cost_item_id, quantity_formula, waste_pct)
       VALUES ($1,$2,$3,$4,$5)`,
      [toOrg, newAssembly, newCostItem, c.quantity_formula, c.waste_pct]
    );
  }

  // scope_assembly_map (remapped assembly ids).
  const mapRows = (
    await client.query(
      `SELECT scope_toggle, scope_class, assembly_id, priority, param_bindings, notes
       FROM scope_assembly_map WHERE org_id = $1 AND deleted_at IS NULL`,
      [fromOrg]
    )
  ).rows;
  for (const m of mapRows) {
    const newAssembly = assemblyMap.get(m.assembly_id);
    if (!newAssembly) continue;
    await client.query(
      `INSERT INTO scope_assembly_map (org_id, scope_toggle, scope_class, assembly_id, priority, param_bindings, notes)
       VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [toOrg, m.scope_toggle, m.scope_class, newAssembly, m.priority, m.param_bindings, m.notes]
    );
  }

  // assembly_modifiers + markup_templates (no remap; assembly_id is NULL on
  // the starter modifiers, so a straight copy is correct).
  await client.query(
    `INSERT INTO assembly_modifiers (org_id, assembly_id, dimension, dim_key, multiplier, range_widen_pct, notes)
     SELECT $2, NULL, dimension, dim_key, multiplier, range_widen_pct, notes
     FROM assembly_modifiers WHERE org_id = $1 AND assembly_id IS NULL AND deleted_at IS NULL`,
    [fromOrg, toOrg]
  );
  await client.query(
    `INSERT INTO markup_templates (org_id, apply_order, name, markup_kind, rate_pct, fixed_amount, is_active)
     SELECT $2, apply_order, name, markup_kind, rate_pct, fixed_amount, is_active
     FROM markup_templates WHERE org_id = $1 AND deleted_at IS NULL`,
    [fromOrg, toOrg]
  );
}

/**
 * Idempotent: returns the caller's workspace, creating it (org + membership +
 * intake link + starter config) on first sign-in. Concurrent first sign-ins
 * are serialized by a per-email advisory lock so a double-submit cannot make
 * two orgs.
 */
export async function ensureWorkspace(email: string, name: string | null): Promise<Workspace> {
  const client = await getPool().connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [`onboard:${email.toLowerCase()}`]);

    // Already provisioned?
    const existing = (
      await client.query(
        `SELECT u.id AS user_id, m.org_id, m.role, o.name AS org_name
         FROM users u
         JOIN org_memberships m ON m.user_id = u.id AND m.is_active AND m.deleted_at IS NULL
         JOIN organizations o ON o.id = m.org_id AND o.deleted_at IS NULL
         WHERE lower(u.email) = lower($1) AND u.deleted_at IS NULL
         ORDER BY m.created_at LIMIT 1`,
        [email]
      )
    ).rows[0];
    if (existing) {
      await client.query("COMMIT");
      return { userId: existing.user_id, orgId: existing.org_id, orgName: existing.org_name, role: existing.role };
    }

    // user (reuse if the email exists without a membership)
    let userId = (
      await client.query(`SELECT id FROM users WHERE lower(email) = lower($1) AND deleted_at IS NULL`, [email])
    ).rows[0]?.id;
    if (!userId) {
      userId = (
        await client.query(`INSERT INTO users (email, full_name) VALUES ($1,$2) RETURNING id`, [
          email,
          name ?? email,
        ])
      ).rows[0].id;
    }

    const orgName = name ? `${name}'s workspace` : `${email.split("@")[0]}'s workspace`;
    const orgId = (
      await client.query(
        `INSERT INTO organizations (name, org_kind) VALUES ($1, 'general_contractor') RETURNING id`,
        [orgName]
      )
    ).rows[0].id;
    await client.query(
      `INSERT INTO org_memberships (org_id, user_id, role) VALUES ($1,$2,'owner_admin')`,
      [orgId, userId]
    );

    // A ready-to-share intake link (X-1: they can take a lead on day one).
    const slug = `gc-${randomBytes(6).toString("hex")}`;
    await client.query(
      `INSERT INTO intake_links (org_id, slug, channel, label, display_name, is_active)
       VALUES ($1,$2,'link','My estimate link',$3,true)`,
      [orgId, slug, orgName]
    );

    // Read the FORCE-RLS'd cost_items catalog under the template's context,
    // then write the new org's config under the new org's context.
    const templateCatalog = await readTemplateCostItems(TEMPLATE_ORG_ID);
    await setOrg(client, orgId);
    await cloneEstimatingConfig(client, TEMPLATE_ORG_ID, orgId, templateCatalog);

    await client.query("COMMIT");
    return { userId, orgId, orgName, role: "owner_admin" };
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}
