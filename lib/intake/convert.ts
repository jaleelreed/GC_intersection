// US-007: a submitted intake auto-creates a project, unassisted.
// One transaction; idempotent per submission; spam never converts. The draft
// estimate (US-011) attaches here when EP-02 lands — estimate_id stays null
// until then, and the submission still converts.
import type { PoolClient } from "pg";
import { getPool } from "../db";
import { SCOPE_TOGGLE_KEYS } from "./schema";
import { notifyOrg } from "../notifications/repo";

const TOGGLE_LABELS: Record<string, string> = {
  bath: "bath",
  kitchen: "kitchen",
  floors: "flooring",
  walls: "walls",
  utilities: "utilities",
  plumbing: "plumbing",
  electric: "electrical",
  mechanical: "HVAC",
  roof: "roof",
  basement: "basement",
};

export function buildProjectName(
  addressLine1: string,
  scopeToggles: Record<string, { on: boolean; class: string | null }>
): string {
  const on = SCOPE_TOGGLE_KEYS.filter((k) => scopeToggles[k]?.on).map((k) => TOGGLE_LABELS[k]);
  const scope = on.length === 0 ? "renovation" : on.slice(0, 2).join(" + ") + (on.length > 2 ? " +" : "");
  return `${addressLine1} — ${scope}`;
}

async function nextProjectCode(client: PoolClient, orgId: string, year: number): Promise<string> {
  const prefix = `INT-${year}-`;
  const r = await client.query(
    `SELECT coalesce(max(nullif(split_part(code, '-', 3), '')::int), 0) + 1 AS seq
     FROM projects WHERE org_id = $1 AND code LIKE $2`,
    [orgId, `${prefix}%`]
  );
  return `${prefix}${String(r.rows[0].seq).padStart(3, "0")}`;
}

/**
 * Converts a submitted intake into a project. Returns the project id, or null
 * when the submission is missing / spam / discarded. Re-running on an
 * already-converted submission returns the existing project id.
 */
export async function convertSubmission(submissionId: string): Promise<string | null> {
  const client = await getPool().connect();
  try {
    await client.query("BEGIN");

    const sub = (
      await client.query(
        `SELECT id, org_id, status, project_id, channel, address_line1, address_line2,
                city, state, postal_code, county_fips, square_footage, scope_toggles
         FROM intake_submissions
         WHERE id = $1 AND deleted_at IS NULL
         FOR UPDATE`,
        [submissionId]
      )
    ).rows[0];

    if (!sub) {
      await client.query("ROLLBACK");
      return null;
    }
    if (sub.status === "converted" && sub.project_id) {
      await client.query("COMMIT");
      return sub.project_id; // idempotent replay
    }
    if (sub.status !== "submitted") {
      await client.query("ROLLBACK");
      return null; // spam / discarded never convert
    }

    const code = await nextProjectCode(client, sub.org_id, new Date().getFullYear());
    const name = buildProjectName(sub.address_line1, sub.scope_toggles);

    const project = (
      await client.query(
        `INSERT INTO projects (
           org_id, code, name, stage, sector,
           address_line1, address_line2, city, state, zip, county,
           gross_sf
         ) VALUES ($1, $2, $3, 'pursuit', 'residential', $4, $5, $6, $7, $8, $9, $10)
         RETURNING id`,
        [
          sub.org_id,
          code,
          name,
          sub.address_line1,
          sub.address_line2,
          sub.city,
          sub.state,
          sub.postal_code,
          sub.county_fips,
          sub.square_footage == null ? null : Math.round(Number(sub.square_footage)),
        ]
      )
    ).rows[0];

    await client.query(
      `UPDATE intake_submissions SET status = 'converted', project_id = $2 WHERE id = $1`,
      [submissionId, project.id]
    );

    // US-008: the GC finds out in-platform, same transaction as the
    // conversion — a converted lead without a notification cannot exist.
    // Body gains the range + swing drivers when US-011 attaches here.
    await notifyOrg(client, sub.org_id, {
      kind: "intake_received",
      subject_table: "intake_submissions",
      subject_id: submissionId,
      title: `New lead: ${sub.address_line1}`,
      body: `${name} · via ${sub.channel ?? "link"}`,
    });

    await client.query("COMMIT");
    return project.id;
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}
