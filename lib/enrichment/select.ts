// Chooses the enrichment provider by env. Default is the deterministic fixture
// provider (ADR-002: enrichment is fast-follow). Set ENRICHMENT_PROVIDER=dc to
// use live DC Open Data. One place so the intake route stays clean.
import type { EnrichmentProvider } from "./provider";
import { FixtureEnrichmentProvider } from "./provider";
import { DcOpenDataProvider } from "./dc";

export function getEnrichmentProvider(): EnrichmentProvider {
  if (process.env.ENRICHMENT_PROVIDER === "dc") return new DcOpenDataProvider();
  return new FixtureEnrichmentProvider();
}
