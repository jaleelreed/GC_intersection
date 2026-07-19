// US-005c persistence: snapshots carry provenance for anything pre-filled.
import { orgQuery } from "../db";
import type { EnrichmentResult } from "./provider";

export async function storeSnapshot(
  orgId: string,
  addressNormalized: string,
  result: EnrichmentResult
): Promise<string> {
  // enrichment_snapshots is FORCE RLS — scope the insert to the org.
  const r = await orgQuery<{ id: string }>(
    orgId,
    `INSERT INTO enrichment_snapshots (org_id, address_normalized, provider, raw_payload, extracted)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING id`,
    [orgId, addressNormalized, result.provider, JSON.stringify(result.raw_payload), JSON.stringify(result.extracted)]
  );
  return r.rows[0].id;
}
