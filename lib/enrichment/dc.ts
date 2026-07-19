// Live DC address enrichment against DC's public Open Data (ArcGIS REST) —
// no API key. Gated behind ENRICHMENT_PROVIDER=dc; the default remains the
// fixture provider so CI and dev stay deterministic. The PARSING is a pure,
// unit-tested function; the network call is a thin wrapper around it.
//
// Endpoints (public, documented at opendata.dc.gov). Field names vary across
// DC's CAMA layers, so the parser tries several common ones and degrades to an
// empty extract (which is the normal state) rather than guessing.
import type { EnrichmentProvider, EnrichmentResult, EnrichmentExtract } from "./provider";

// Address Points layer — geocode an address string to attributes incl. SSL.
const ADDRESS_FIND =
  "https://maps2.dcgis.dc.gov/dcgis/rest/services/DCGIS_DATA/Address_Points/MapServer/0/query";
// Computer Assisted Mass Appraisal (residential) — property characteristics.
const CAMA_QUERY =
  "https://maps2.dcgis.dc.gov/dcgis/rest/services/DCGIS_DATA/Property_and_Land_WebMercator/MapServer/25/query";

interface ArcGisFeature {
  attributes?: Record<string, unknown>;
}
interface ArcGisResponse {
  features?: ArcGisFeature[];
}

function num(v: unknown): number | undefined {
  const n = typeof v === "string" ? Number(v) : (v as number);
  return Number.isFinite(n) && n > 0 ? n : undefined;
}

/** Pure: turn CAMA/address attributes into our extract shape. Unit-tested. */
export function parseDcAttributes(
  address: Record<string, unknown> | undefined,
  cama: Record<string, unknown> | undefined
): EnrichmentExtract {
  const out: EnrichmentExtract = {};
  const c = cama ?? {};
  // Actual year built (AYB) is the standard CAMA field; fall back to EYB.
  const yb = num(c.AYB) ?? num(c.ayb) ?? num(c.YR_BUILT) ?? num(c.EYB) ?? num(c.eyb);
  if (yb && yb >= 1700 && yb <= 2100) out.year_built = yb;
  const gsf = num(c.GBA) ?? num(c.gba) ?? num(c.LIVING_GBA) ?? num(c.gross_building_area);
  if (gsf) out.gsf = gsf;
  const stories = num(c.STORIES) ?? num(c.stories) ?? num(c.NUM_STORIES);
  if (stories) out.stories = stories;
  // Historic district flag sometimes rides on the address record.
  const a = address ?? {};
  const hist = a.HISTORICDIST ?? a.HISTORIC_DIST ?? a.historic_district;
  if (typeof hist === "string" && hist.trim() && hist.toLowerCase() !== "none") {
    out.historic_district = true;
  }
  return out;
}

async function fetchJson(url: string, params: Record<string, string>): Promise<ArcGisResponse | null> {
  const qs = new URLSearchParams({ f: "json", ...params }).toString();
  try {
    const r = await fetch(`${url}?${qs}`, { signal: AbortSignal.timeout(6000) });
    if (!r.ok) return null;
    return (await r.json()) as ArcGisResponse;
  } catch {
    return null;
  }
}

export class DcOpenDataProvider implements EnrichmentProvider {
  readonly name = "dc_opendata";

  async enrich(address: { line1: string; city: string; state: string; postal_code: string }): Promise<EnrichmentResult> {
    // 1) Geocode the address to its Address Point attributes (incl. SSL).
    const where = `FULLADDRESS = '${address.line1.toUpperCase().replace(/'/g, "''")}'`;
    const addr = await fetchJson(ADDRESS_FIND, { where, outFields: "*", returnGeometry: "false" });
    const addrAttrs = addr?.features?.[0]?.attributes;
    const ssl = addrAttrs?.SSL ?? addrAttrs?.ssl;

    // 2) Look up CAMA by SSL for property characteristics.
    let camaAttrs: Record<string, unknown> | undefined;
    if (ssl) {
      const cama = await fetchJson(CAMA_QUERY, {
        where: `SSL = '${String(ssl).replace(/'/g, "''")}'`,
        outFields: "*",
        returnGeometry: "false",
      });
      camaAttrs = cama?.features?.[0]?.attributes;
    }

    const extracted = parseDcAttributes(addrAttrs, camaAttrs);
    return {
      provider: this.name,
      raw_payload: { matched: Boolean(addrAttrs), ssl: ssl ?? null },
      extracted,
    };
  }
}
