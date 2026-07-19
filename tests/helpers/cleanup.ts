// Shared test cleanup: removes everything a submission cascade creates, in
// FK order (hints → notifications → submissions → ai_jobs → projects).
// One place to extend as the conversion grows (estimates in US-011, etc.).
import type { Pool } from "pg";

export async function cleanupSubmissions(pool: Pool, emailPattern: string): Promise<void> {
  const projectIds = (
    await pool.query(
      `SELECT project_id FROM intake_submissions
       WHERE contact_email LIKE $1 AND project_id IS NOT NULL`,
      [emailPattern]
    )
  ).rows.map((r) => r.project_id);
  const snapshotIds = (
    await pool.query(
      `SELECT enrichment_snapshot_id FROM intake_submissions
       WHERE contact_email LIKE $1 AND enrichment_snapshot_id IS NOT NULL`,
      [emailPattern]
    )
  ).rows.map((r) => r.enrichment_snapshot_id);

  const estimateIds = (
    await pool.query(
      `SELECT estimate_id FROM intake_submissions
       WHERE contact_email LIKE $1 AND estimate_id IS NOT NULL`,
      [emailPattern]
    )
  ).rows.map((r) => r.estimate_id);

  await pool.query(
    `DELETE FROM estimate_generation_runs WHERE intake_submission_id IN (
       SELECT id FROM intake_submissions WHERE contact_email LIKE $1)`,
    [emailPattern]
  );
  await pool.query(
    `DELETE FROM intake_scope_hints WHERE intake_submission_id IN (
       SELECT id FROM intake_submissions WHERE contact_email LIKE $1)`,
    [emailPattern]
  );
  await pool.query(
    `DELETE FROM notifications WHERE subject_table = 'intake_submissions' AND subject_id IN (
       SELECT id FROM intake_submissions WHERE contact_email LIKE $1)`,
    [emailPattern]
  );
  // Circular FKs: submissions.estimate_id → estimates AND
  // estimates.intake_submission_id → submissions. Null the pointer, delete
  // the estimate chain, THEN the submissions.
  await pool.query(
    `UPDATE intake_submissions SET estimate_id = NULL WHERE contact_email LIKE $1`,
    [emailPattern]
  );
  if (estimateIds.length) {
    await pool.query(
      `DELETE FROM estimate_lines WHERE estimate_version_id IN (
         SELECT id FROM estimate_versions WHERE estimate_id = ANY($1))`,
      [estimateIds]
    );
    await pool.query(
      `DELETE FROM estimate_markups WHERE estimate_version_id IN (
         SELECT id FROM estimate_versions WHERE estimate_id = ANY($1))`,
      [estimateIds]
    );
    await pool.query(`UPDATE estimates SET current_version_id = NULL WHERE id = ANY($1)`, [estimateIds]);
    await pool.query(`DELETE FROM estimate_versions WHERE estimate_id = ANY($1)`, [estimateIds]);
    await pool.query(`DELETE FROM estimates WHERE id = ANY($1)`, [estimateIds]);
  }
  await pool.query(`DELETE FROM intake_submissions WHERE contact_email LIKE $1`, [emailPattern]);
  if (snapshotIds.length) {
    await pool.query(`DELETE FROM enrichment_snapshots WHERE id = ANY($1)`, [snapshotIds]);
  }
  if (projectIds.length) {
    await pool.query(`DELETE FROM ai_jobs WHERE project_id = ANY($1)`, [projectIds]);
    await pool.query(`DELETE FROM projects WHERE id = ANY($1)`, [projectIds]);
  }
}
