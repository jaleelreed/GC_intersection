// Rate library management (§17: the flywheel proposes, the operator confirms).
// These are the LEARNED rates the generator actually uses (harvested from the
// GC's own edits; they beat the market seed). Editing one changes future
// drafts; deleting reverts that cost code to the market seed. Org-scoped.
import { orgQuery } from "../db";

export interface Rate {
  id: string;
  name: string;
  cost_code: string | null;
  uom: string;
  unit_cost: string;
  updated_at: string;
}

export async function listRates(orgId: string): Promise<Rate[]> {
  const r = await orgQuery<Rate>(
    orgId,
    `SELECT ci.id, ci.name, c.code AS cost_code, ci.uom, ci.sub_unit_cost AS unit_cost, ci.updated_at
     FROM cost_items ci
     LEFT JOIN cost_codes c ON c.id = ci.cost_code_id
     WHERE ci.org_id = $1 AND ci.source = 'harvested_bid' AND ci.deleted_at IS NULL
     ORDER BY ci.updated_at DESC`,
    [orgId]
  );
  return r.rows;
}

export async function updateRate(orgId: string, id: string, unitCost: string): Promise<boolean> {
  const r = await orgQuery(
    orgId,
    `UPDATE cost_items SET sub_unit_cost = $3
     WHERE id = $2 AND org_id = $1 AND source = 'harvested_bid' AND deleted_at IS NULL`,
    [orgId, id, unitCost]
  );
  return (r.rowCount ?? 0) > 0;
}

/** Soft-delete a learned rate → that cost code reverts to the market seed. */
export async function deleteRate(orgId: string, id: string): Promise<boolean> {
  const r = await orgQuery(
    orgId,
    `UPDATE cost_items SET deleted_at = now()
     WHERE id = $2 AND org_id = $1 AND source = 'harvested_bid' AND deleted_at IS NULL`,
    [orgId, id]
  );
  return (r.rowCount ?? 0) > 0;
}
