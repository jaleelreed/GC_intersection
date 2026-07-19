// Live DC enrichment: the parser is pure and deterministic (no network in
// tests). Field-name resilience + degrade-to-empty are the contract.
import { describe, expect, it } from "vitest";
import { parseDcAttributes } from "../lib/enrichment/dc";
import { getEnrichmentProvider } from "../lib/enrichment/select";
import { FixtureEnrichmentProvider } from "../lib/enrichment/provider";
import { DcOpenDataProvider } from "../lib/enrichment/dc";

describe("parseDcAttributes", () => {
  it("reads year built / gsf / stories across common CAMA field names", () => {
    expect(parseDcAttributes(undefined, { AYB: 1926, GBA: 1820, STORIES: 2 })).toEqual({
      year_built: 1926,
      gsf: 1820,
      stories: 2,
    });
    // alternate field names + string numbers
    expect(parseDcAttributes(undefined, { eyb: "1948", living_gba: "1500" })).toMatchObject({
      year_built: 1948,
      gsf: 1500,
    });
  });

  it("flags historic districts from the address record", () => {
    expect(parseDcAttributes({ HISTORICDIST: "Capitol Hill" }, {}).historic_district).toBe(true);
    expect(parseDcAttributes({ HISTORICDIST: "None" }, {}).historic_district).toBeUndefined();
  });

  it("degrades to an empty extract on junk (never guesses)", () => {
    expect(parseDcAttributes({}, { AYB: 0, GBA: "abc" })).toEqual({});
    expect(parseDcAttributes(undefined, undefined)).toEqual({});
  });
});

describe("provider selection", () => {
  it("defaults to fixture; ENRICHMENT_PROVIDER=dc picks DC", () => {
    delete process.env.ENRICHMENT_PROVIDER;
    expect(getEnrichmentProvider()).toBeInstanceOf(FixtureEnrichmentProvider);
    process.env.ENRICHMENT_PROVIDER = "dc";
    expect(getEnrichmentProvider()).toBeInstanceOf(DcOpenDataProvider);
    delete process.env.ENRICHMENT_PROVIDER;
  });
});
