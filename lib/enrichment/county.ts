// US-005c: zip → county_fips for the DC-area launch six. A data table the
// deriver iterates — extend by adding rows, not branches. Unknown zip →
// null → the range widens (US-011); never guessed.

export interface ZipRule {
  prefix: RegExp;
  fips: string;
  county: string;
}

export const ZIP_RULES: ZipRule[] = [
  { prefix: /^200/, fips: "11001", county: "District of Columbia" },
  { prefix: /^(208|209)/, fips: "24031", county: "Montgomery County, MD" },
  { prefix: /^207/, fips: "24033", county: "Prince George's County, MD" },
  { prefix: /^222/, fips: "51013", county: "Arlington County, VA" },
  // Alexandria city zips carve out of the 223xx range before Fairfax's 220/221.
  { prefix: /^2230[1-9]|^2231[0-4]/, fips: "51510", county: "Alexandria City, VA" },
  { prefix: /^(220|221)/, fips: "51059", county: "Fairfax County, VA" },
];

export function deriveCountyFips(postalCode: string): string | null {
  const zip = postalCode.trim().slice(0, 5);
  for (const rule of ZIP_RULES) {
    if (rule.prefix.test(zip)) return rule.fips;
  }
  return null;
}
