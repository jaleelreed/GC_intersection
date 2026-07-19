// US-005c (ADR-002): enrichment behind an interface. Launch ships the fixture
// implementation only; live providers (DC assessor, permits, historic GIS)
// are post-soft-launch implementations of this same interface. Empty
// enrichment is the NORMAL production state, not an error.

export interface EnrichmentExtract {
  year_built?: number;
  gsf?: number;
  stories?: number;
  historic_district?: boolean;
  permit_history?: { year: number; description: string }[];
}

export interface EnrichmentResult {
  provider: string;
  raw_payload: unknown;
  extracted: EnrichmentExtract;
}

export interface EnrichmentProvider {
  readonly name: string;
  enrich(address: { line1: string; city: string; state: string; postal_code: string }): Promise<EnrichmentResult>;
}

// Deterministic canned data for known fixture addresses; unknown → empty
// extract (the normal state). Keyed on normalized line1.
const FIXTURES: Record<string, EnrichmentExtract> = {
  "123 fixture st nw": {
    year_built: 1926,
    gsf: 1820,
    stories: 2,
    historic_district: true,
    permit_history: [
      { year: 2009, description: "Roof replacement" },
      { year: 2016, description: "Basement bathroom addition" },
    ],
  },
  "9 convert test way": {
    year_built: 1954,
    gsf: 1400,
    stories: 1,
    historic_district: false,
    permit_history: [],
  },
};

export class FixtureEnrichmentProvider implements EnrichmentProvider {
  readonly name = "fixture";

  async enrich(address: { line1: string }): Promise<EnrichmentResult> {
    const key = address.line1.trim().toLowerCase();
    const extracted = FIXTURES[key] ?? {};
    return { provider: this.name, raw_payload: { matched: key in FIXTURES }, extracted };
  }
}
