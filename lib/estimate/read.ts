// Read side for the editor + reveal: the current version of a lead's
// estimate, org-scoped (a GC never reads another org's estimate).
import { getPool, orgQuery } from "../db";

export interface EditorLine {
  lineage_id: string;
  cost_code: string | null;
  division: string | null;
  description: string;
  quantity: string;
  uom: string | null;
  unit_cost: string;
  total: string;
  seed_source: string;
  is_allowance: boolean;
  is_alternate: boolean;
}

export interface EditorMarkup {
  name: string;
  markup_kind: string;
  rate_pct: string | null;
  computed_amount: string;
}

export interface EditorEstimate {
  submissionId: string;
  estimateId: string;
  versionId: string;
  versionNo: number;
  locked: boolean;
  addressLine1: string;
  baseTotal: string;
  grandTotal: string;
  rangeLow: string | null;
  rangeHigh: string | null;
  lines: EditorLine[];
  markups: EditorMarkup[];
}

export interface CostCodeOption {
  id: string;
  code: string;
  title: string;
}

/** Cost codes for the add-line picker: platform CSI seed + the org's own. */
export async function costCodeOptions(orgId: string): Promise<CostCodeOption[]> {
  const r = await getPool().query(
    `SELECT id, code, title FROM cost_codes
     WHERE (org_id = $1 OR org_id IS NULL) AND is_active AND deleted_at IS NULL
     ORDER BY code`,
    [orgId]
  );
  return r.rows;
}

export interface VersionRow {
  id: string;
  version_no: number;
  label: string | null;
  grand_total: string;
  created_at: string;
  is_current: boolean;
  locked: boolean;
}

export async function listVersions(estimateId: string, orgId: string): Promise<VersionRow[]> {
  const r = await getPool().query(
    `SELECT v.id, v.version_no, v.label, v.grand_total, v.created_at,
            (v.id = e.current_version_id) AS is_current,
            (v.locked_at IS NOT NULL) AS locked
     FROM estimate_versions v
     JOIN estimates e ON e.id = v.estimate_id
     WHERE v.estimate_id = $1 AND e.org_id = $2 AND v.deleted_at IS NULL
     ORDER BY v.version_no DESC`,
    [estimateId, orgId]
  );
  return r.rows;
}

/**
 * Coverage check (F-4.6): scope toggles the homeowner turned on that produced
 * no priced line in the current estimate — work named but not yet priced.
 */
export async function coverageGaps(submissionId: string, orgId: string): Promise<string[]> {
  const head = (
    await getPool().query(
      `SELECT s.scope_toggles, e.current_version_id
       FROM intake_submissions s
       LEFT JOIN estimates e ON e.id = s.estimate_id
       WHERE s.id = $1 AND s.org_id = $2`,
      [submissionId, orgId]
    )
  ).rows[0];
  if (!head?.current_version_id) return [];
  const onToggles = Object.entries(
    (head.scope_toggles ?? {}) as Record<string, { on: boolean }>
  )
    .filter(([, v]) => v.on)
    .map(([k]) => k);
  if (onToggles.length === 0) return [];

  const covered = (
    await orgQuery(
      orgId,
      `SELECT DISTINCT m.scope_toggle
       FROM estimate_lines l
       JOIN scope_assembly_map m ON m.assembly_id = l.assembly_id AND m.deleted_at IS NULL
       WHERE l.estimate_version_id = $1 AND l.deleted_at IS NULL`,
      [head.current_version_id]
    )
  ).rows.map((r) => r.scope_toggle);

  return onToggles.filter((t) => !covered.includes(t));
}

export async function currentEstimateForLead(
  submissionId: string,
  orgId: string
): Promise<EditorEstimate | null> {
  const head = (
    await getPool().query(
      `SELECT s.id AS submission_id, s.address_line1, e.id AS estimate_id,
              v.id AS version_id, v.version_no, v.locked_at, v.base_total,
              v.grand_total, v.range_low, v.range_high
       FROM intake_submissions s
       JOIN estimates e ON e.id = s.estimate_id
       JOIN estimate_versions v ON v.id = e.current_version_id
       WHERE s.id = $1 AND s.org_id = $2 AND s.deleted_at IS NULL`,
      [submissionId, orgId]
    )
  ).rows[0];
  if (!head) return null;

  const lines = (
    await orgQuery<EditorLine>(
      orgId,
      `SELECT l.lineage_id, c.code AS cost_code, c.csi_division AS division,
              l.description, l.quantity, l.uom, l.unit_cost, l.total, l.seed_source,
              l.is_allowance, l.is_alternate
       FROM estimate_lines l
       LEFT JOIN cost_codes c ON c.id = l.cost_code_id
       WHERE l.estimate_version_id = $1 AND l.deleted_at IS NULL
       ORDER BY l.sort_order`,
      [head.version_id]
    )
  ).rows;

  const markups = (
    await getPool().query(
      `SELECT name, markup_kind, rate_pct, computed_amount
       FROM estimate_markups WHERE estimate_version_id = $1 AND deleted_at IS NULL
       ORDER BY apply_order`,
      [head.version_id]
    )
  ).rows;

  return {
    submissionId: head.submission_id,
    estimateId: head.estimate_id,
    versionId: head.version_id,
    versionNo: head.version_no,
    locked: head.locked_at != null,
    addressLine1: head.address_line1,
    baseTotal: head.base_total,
    grandTotal: head.grand_total,
    rangeLow: head.range_low,
    rangeHigh: head.range_high,
    lines,
    markups,
  };
}
