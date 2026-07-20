// Gap 5: convergence insights — make the moat visible. Edit coverage across
// estimates (the D10 trust-floor signal) and a transparent view of what the
// platform has learned from this GC's own edits.
import { orgQuery } from "../db";
import { editMetrics } from "../estimate/edit";

export interface ConvergenceSummary {
  estimatesTotal: number;
  estimatesEdited: number; // have 2+ versions
  avgEditCoveragePct: number | null; // across edited estimates
  learnedRateCount: number;
}

export async function convergenceSummary(orgId: string): Promise<ConvergenceSummary> {
  const estimatesTotal = Number(
    (await orgQuery(orgId, `SELECT count(*)::int AS n FROM estimates WHERE org_id = $1 AND deleted_at IS NULL`, [orgId]))
      .rows[0].n
  );

  // Estimates with 2+ versions: first vs latest version ids.
  const edited = (
    await orgQuery(
      orgId,
      `SELECT estimate_id,
              (array_agg(id ORDER BY version_no ASC))[1] AS first_id,
              (array_agg(id ORDER BY version_no DESC))[1] AS latest_id
       FROM estimate_versions
       WHERE org_id = $1 AND deleted_at IS NULL
       GROUP BY estimate_id
       HAVING count(*) >= 2`,
      [orgId]
    )
  ).rows;

  let coverageSum = 0;
  let coverageN = 0;
  for (const e of edited) {
    const m = await editMetrics(orgId, e.first_id, e.latest_id);
    if (m.priorLines > 0) {
      coverageSum += m.editCoverage;
      coverageN += 1;
    }
  }

  const learnedRateCount = Number(
    (
      await orgQuery(
        orgId,
        `SELECT count(*)::int AS n FROM cost_items
         WHERE org_id = $1 AND source = 'harvested_bid' AND deleted_at IS NULL`,
        [orgId]
      )
    ).rows[0].n
  );

  return {
    estimatesTotal,
    estimatesEdited: edited.length,
    avgEditCoveragePct: coverageN > 0 ? Math.round((coverageSum / coverageN) * 100) : null,
    learnedRateCount,
  };
}

export interface LearnedRate {
  name: string;
  cost_code: string | null;
  uom: string;
  unit_cost: string;
  learned_at: string;
}

export async function learnedRates(orgId: string, limit = 100): Promise<LearnedRate[]> {
  const r = await orgQuery<LearnedRate>(
    orgId,
    `SELECT ci.name, c.code AS cost_code, ci.uom, ci.sub_unit_cost AS unit_cost, ci.created_at AS learned_at
     FROM cost_items ci
     LEFT JOIN cost_codes c ON c.id = ci.cost_code_id
     WHERE ci.org_id = $1 AND ci.source = 'harvested_bid' AND ci.deleted_at IS NULL
     ORDER BY ci.created_at DESC
     LIMIT $2`,
    [orgId, limit]
  );
  return r.rows;
}
