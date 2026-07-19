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
  await pool.query(`DELETE FROM intake_submissions WHERE contact_email LIKE $1`, [emailPattern]);
  if (projectIds.length) {
    await pool.query(`DELETE FROM ai_jobs WHERE project_id = ANY($1)`, [projectIds]);
    await pool.query(`DELETE FROM projects WHERE id = ANY($1)`, [projectIds]);
  }
}
