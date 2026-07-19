// Data access for the intake front door (US-005). All SQL for the story lives
// here so route handlers stay thin and tests can exercise the real queries.
import { getPool } from "../db";
import type { IntakeSubmissionInput } from "./schema";

export interface IntakeLink {
  id: string;
  org_id: string;
  slug: string;
  channel: "embed" | "link" | "qr";
  display_name: string | null;
  label: string | null;
}

export async function findActiveLink(slug: string): Promise<IntakeLink | null> {
  const r = await getPool().query(
    `SELECT id, org_id, slug, channel, display_name, label
     FROM intake_links
     WHERE slug = $1 AND is_active AND deleted_at IS NULL`,
    [slug]
  );
  return r.rows[0] ?? null;
}

export async function insertSubmission(
  link: IntakeLink,
  input: IntakeSubmissionInput,
  status: "submitted" | "spam"
): Promise<{ id: string }> {
  const r = await getPool().query(
    `INSERT INTO intake_submissions (
       org_id, intake_link_id, channel, status,
       contact_name, contact_email, contact_phone,
       address_line1, address_line2, city, state, postal_code,
       square_footage, existing_config, target_config, conditions,
       scope_toggles, structural_flags, finish_tier, narrative
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20)
     RETURNING id`,
    [
      link.org_id,
      link.id,
      link.channel,
      status,
      input.contact_name,
      input.contact_email,
      input.contact_phone,
      input.address_line1,
      input.address_line2,
      input.city,
      input.state,
      input.postal_code,
      input.square_footage,
      JSON.stringify(input.existing_config),
      JSON.stringify(input.target_config),
      JSON.stringify(input.conditions),
      JSON.stringify(input.scope_toggles),
      JSON.stringify(input.structural_flags),
      input.finish_tier,
      input.narrative,
    ]
  );
  return { id: r.rows[0].id };
}
