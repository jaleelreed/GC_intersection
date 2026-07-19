// Gap 6: workspace settings — business identity (on the hosted form + bid),
// service areas, and markup defaults that seed new drafts. Org-scoped.
import { getPool } from "../db";

export async function setBusinessName(orgId: string, name: string): Promise<void> {
  const client = await getPool().connect();
  try {
    await client.query("BEGIN");
    await client.query(`UPDATE organizations SET name = $2 WHERE id = $1`, [orgId, name]);
    // The hosted form/bid header reads intake_links.display_name — keep it in sync.
    await client.query(
      `UPDATE intake_links SET display_name = $2 WHERE org_id = $1 AND deleted_at IS NULL`,
      [orgId, name]
    );
    await client.query("COMMIT");
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
}

export interface CountyOption {
  fips: string;
  name: string;
  state_code: string;
  active: boolean;
}

export async function serviceAreaOptions(orgId: string): Promise<CountyOption[]> {
  const r = await getPool().query(
    `SELECT c.fips, c.name, c.state_code,
            (sa.id IS NOT NULL) AS active
     FROM counties c
     LEFT JOIN org_service_areas sa ON sa.county_fips = c.fips AND sa.org_id = $1 AND sa.deleted_at IS NULL
     WHERE c.deleted_at IS NULL
     ORDER BY c.state_code, c.name`,
    [orgId]
  );
  return r.rows;
}

export async function toggleServiceArea(orgId: string, fips: string, add: boolean): Promise<void> {
  if (add) {
    await getPool().query(
      `INSERT INTO org_service_areas (org_id, county_fips) VALUES ($1, $2)
       ON CONFLICT (org_id, county_fips) DO UPDATE SET deleted_at = NULL`,
      [orgId, fips]
    );
  } else {
    await getPool().query(
      `UPDATE org_service_areas SET deleted_at = now() WHERE org_id = $1 AND county_fips = $2`,
      [orgId, fips]
    );
  }
}

export interface MarkupTemplate {
  id: string;
  apply_order: number;
  name: string;
  rate_pct: string | null;
}

export async function listMarkupTemplates(orgId: string): Promise<MarkupTemplate[]> {
  const r = await getPool().query(
    `SELECT id, apply_order, name, rate_pct FROM markup_templates
     WHERE org_id = $1 AND is_active AND deleted_at IS NULL ORDER BY apply_order`,
    [orgId]
  );
  return r.rows;
}

export async function setMarkupRate(orgId: string, id: string, ratePct: string): Promise<boolean> {
  const r = await getPool().query(
    `UPDATE markup_templates SET rate_pct = $3 WHERE id = $2 AND org_id = $1 AND deleted_at IS NULL`,
    [orgId, id, ratePct]
  );
  return (r.rowCount ?? 0) > 0;
}
