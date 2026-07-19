// Gap 2: the lead pipeline. A lead is an intake submission viewed as sales
// work — a stage, notes, follow-up. Org-scoped throughout.
import { getPool, orgQuery } from "../db";
import { LEAD_STAGES, type LeadStage, type LeadRow, type LeadNote } from "./types";

export { LEAD_STAGES };
export type { LeadStage, LeadRow, LeadNote };

export async function listLeads(
  orgId: string,
  opts: { stage?: LeadStage } = {}
): Promise<LeadRow[]> {
  const r = await getPool().query(
    `SELECT s.id, s.address_line1, s.city, s.channel, s.contact_name,
            s.pipeline_stage, s.submitted_at,
            v.grand_total, v.range_low, v.range_high
     FROM intake_submissions s
     LEFT JOIN estimates e ON e.id = s.estimate_id
     LEFT JOIN estimate_versions v ON v.id = e.current_version_id
     WHERE s.org_id = $1 AND s.status = 'converted' AND s.deleted_at IS NULL
       ${opts.stage ? "AND s.pipeline_stage = $2" : ""}
     ORDER BY s.submitted_at DESC`,
    opts.stage ? [orgId, opts.stage] : [orgId]
  );
  return r.rows;
}

export async function stageCounts(orgId: string): Promise<Record<LeadStage, number>> {
  const r = await getPool().query(
    `SELECT pipeline_stage, count(*)::int AS n
     FROM intake_submissions
     WHERE org_id = $1 AND status = 'converted' AND deleted_at IS NULL
     GROUP BY pipeline_stage`,
    [orgId]
  );
  const out = { new: 0, contacted: 0, quoted: 0, won: 0, lost: 0 } as Record<LeadStage, number>;
  for (const row of r.rows) out[row.pipeline_stage as LeadStage] = row.n;
  return out;
}

export async function setStage(orgId: string, submissionId: string, stage: LeadStage): Promise<boolean> {
  const r = await getPool().query(
    `UPDATE intake_submissions SET pipeline_stage = $3, pipeline_updated_at = now()
     WHERE id = $2 AND org_id = $1 AND deleted_at IS NULL`,
    [orgId, submissionId, stage]
  );
  return (r.rowCount ?? 0) > 0;
}

export async function listNotes(orgId: string, submissionId: string): Promise<LeadNote[]> {
  // RLS-enforced (lead_notes is FORCE RLS) — must run scoped to the org.
  const r = await orgQuery<LeadNote>(
    orgId,
    `SELECT id, body, created_at FROM lead_notes
     WHERE org_id = $1 AND intake_submission_id = $2 AND deleted_at IS NULL
     ORDER BY created_at DESC`,
    [orgId, submissionId]
  );
  return r.rows;
}

export async function addNote(
  orgId: string,
  submissionId: string,
  authorUserId: string,
  body: string
): Promise<LeadNote> {
  const r = await orgQuery<LeadNote>(
    orgId,
    `INSERT INTO lead_notes (org_id, intake_submission_id, author_user_id, body)
     VALUES ($1, $2, $3, $4) RETURNING id, body, created_at`,
    [orgId, submissionId, authorUserId, body]
  );
  return r.rows[0];
}
