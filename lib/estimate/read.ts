// Read side for the editor + reveal: the current version of a lead's
// estimate, org-scoped (a GC never reads another org's estimate).
import { getPool } from "../db";

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
    await getPool().query(
      `SELECT l.lineage_id, c.code AS cost_code, c.csi_division AS division,
              l.description, l.quantity, l.uom, l.unit_cost, l.total, l.seed_source
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
