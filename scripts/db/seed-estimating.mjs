// EP-02 estimating seed (US-009/US-010): cost codes, county market costs,
// the fixture org's catalog, assemblies, toggle→assembly map, modifiers,
// markup templates. All values marked [seed] in the contracts are HONEST
// AUTHORED GUESSES — calibration inputs the soft launch tunes (D9/D10).
// Deterministic ids => idempotent re-seed.

export const TEST_ORG_ID = "00000000-0000-4000-8000-000000000001";

const fid = (family, n) =>
  `00000000-0000-4000-9000-${family}${String(n).padStart(9, "0")}`;

// family prefixes (3 chars): cc = cost code, mk = market, ci = cost item,
// as = assembly, ac = component, sm = scope map, mo = modifier, mt = markup
const ID = {
  cc: (n) => fid("100", n),
  mk: (n) => fid("200", n),
  ci: (n) => fid("300", n),
  as: (n) => fid("400", n),
  ac: (n) => fid("500", n),
  sm: (n) => fid("600", n),
  mo: (n) => fid("700", n),
  mt: (n) => fid("800", n),
};

// [code, title, division] — platform CSI seed rows (org_id NULL by design).
const COST_CODES = [
  ["02 41 19", "Selective Demolition", "02"],
  ["06 10 00", "Rough Carpentry", "06"],
  ["06 40 00", "Architectural Casework", "06"],
  ["07 30 00", "Steep Slope Roofing", "07"],
  ["09 29 00", "Gypsum Board", "09"],
  ["09 30 00", "Tiling", "09"],
  ["09 65 00", "Resilient Flooring", "09"],
  ["09 91 00", "Painting", "09"],
  ["22 11 00", "Plumbing Piping", "22"],
  ["22 40 00", "Plumbing Fixtures", "22"],
  ["23 00 00", "HVAC", "23"],
  ["26 00 00", "Electrical", "26"],
];

// DC-base market unit costs per cost code: [codeIdx, uom, labor, material].
// County variation applied below. "Real ugly": uneven, not round.
const MARKET_BASE = [
  [0, "SF", "1.85", "0.42"],   // demo
  [1, "SF", "3.10", "2.65"],   // rough carpentry
  [2, "LF", "38.00", "142.00"],// casework
  [3, "SQ", "310.00", "265.00"],// roofing per square
  [4, "SF", "1.42", "0.68"],   // drywall
  [5, "SF", "9.80", "6.40"],   // tile
  [6, "SF", "2.35", "3.85"],   // resilient flooring
  [7, "SF", "1.15", "0.48"],   // painting
  [8, "LF", "14.50", "6.20"],  // plumbing piping
  [9, "EA", "285.00", "410.00"],// plumbing fixtures
  [10, "EA", "1450.00", "3200.00"],// HVAC unit-ish
  [11, "EA", "96.00", "38.00"],// electrical device/rough per point
];

// County cost factors over the DC base [fips, factor-as-string].
const COUNTY_FACTORS = [
  ["11001", "1.00"],
  ["24031", "1.04"],
  ["24033", "0.97"],
  ["51013", "1.06"],
  ["51059", "1.02"],
  ["51510", "1.05"],
];

// Fixture-org catalog items: [ccIdx, name, uom]. Unit costs live in the
// market rows; these are the classification + uom carriers components point at.
const CATALOG = [
  [0, "Selective interior demolition", "SF"],
  [1, "Rough framing allowance", "SF"],
  [2, "Kitchen cabinets, hung + set", "LF"],
  [3, "Asphalt shingle roof, replaced", "SQ"],
  [4, "GWB hung, taped, finished", "SF"],
  [5, "Ceramic tile, set + grouted", "SF"],
  [6, "LVP flooring, installed", "SF"],
  [7, "Paint, two coats", "SF"],
  [8, "Supply/waste re-pipe", "LF"],
  [9, "Bath/kitchen fixture, set", "EA"],
  [10, "HVAC system work", "EA"],
  [11, "Electrical point (device/rough)", "EA"],
];

// Assemblies: [toggleKey, name, uom, components: [ciIdx, qtyFormula]].
// Formulas reference the params bound in SCOPE_MAP below.
const ASSEMBLIES = [
  ["bath", "Bathroom renovation package", "EA", [
    [0, "area_sf"],
    [5, "area_sf * 3.2"],
    [4, "area_sf * 2.4"],
    [9, "3"],
    [8, "area_sf * 0.6"],
    [11, "4"],
    [7, "area_sf * 2.4"],
  ]],
  ["kitchen", "Kitchen renovation package", "EA", [
    [0, "area_sf"],
    [2, "area_sf * 0.45"],
    [9, "1"],
    [11, "6"],
    [4, "area_sf * 1.8"],
    [7, "area_sf * 1.8"],
    [6, "area_sf"],
  ]],
  ["floors", "Whole-home flooring", "SF", [[6, "area_sf"]]],
  ["walls", "Walls & paint refresh", "SF", [
    [4, "area_sf * 0.25"],
    [7, "area_sf"],
  ]],
  ["utilities", "Utility service allowance", "EA", [
    [8, "40"],
    [11, "8"],
  ]],
  ["plumbing", "Re-pipe package", "EA", [[8, "area_lf"]]],
  ["electric", "Electrical update package", "EA", [[11, "points"]]],
  ["mechanical", "HVAC replacement", "EA", [[10, "1"]]],
  ["roof", "Roof replacement", "EA", [[3, "squares"]]],
  ["basement", "Basement finish package", "SF", [
    [4, "area_sf * 2.1"],
    [6, "area_sf"],
    [7, "area_sf * 2.1"],
    [11, "area_sf * 0.04"],
  ]],
];

// Toggle → assembly bindings: param formulas over submission.* names.
const SCOPE_MAP_BINDINGS = {
  bath: { area_sf: "submission.square_footage * 0.08" },
  kitchen: { area_sf: "submission.square_footage * 0.12" },
  floors: { area_sf: "submission.square_footage * 0.85" },
  walls: { area_sf: "submission.square_footage * 2.4" },
  utilities: {},
  plumbing: { area_lf: "submission.square_footage * 0.35" },
  electric: { points: "submission.square_footage * 0.02" },
  mechanical: {},
  roof: { squares: "submission.square_footage * 0.011" },
  basement: { area_sf: "submission.square_footage * 0.3" },
};

// [dimension, dim_key, multiplier, range_widen_pct] — the [seed] table from
// the contracts, including explicit unknown-rows (unknown never defaults
// silently: multiplier 1.0, the band grows).
const MODIFIERS = [
  ["scope_class", "in_place", "1.00", "0"],
  ["scope_class", "reconfigure", "1.25", "8"],
  ["scope_class", "relocate", "1.45", "12"],
  ["scope_class", "unknown", "1.00", "10"],
  ["condition", "pre_1940", "1.15", "8"],
  ["condition", "1940_1977", "1.08", "4"],
  ["condition", "year_built_unknown", "1.00", "4"],
  ["condition", "occupied", "1.08", "3"],
  ["condition", "occupied_unknown", "1.00", "2"],
  ["condition", "access_difficult", "1.10", "4"],
  ["condition", "access_unknown", "1.00", "2"],
  ["condition", "known_problem", "1.00", "5"],
  ["finish_tier", "economy", "0.85", "0"],
  ["finish_tier", "mid", "1.00", "0"],
  ["finish_tier", "custom", "1.35", "10"],
  ["finish_tier", "unknown", "1.00", "6"],
];

export async function seedEstimating(client) {
  for (let i = 0; i < COST_CODES.length; i++) {
    const [code, title, div] = COST_CODES[i];
    await client.query(
      `INSERT INTO cost_codes (id, org_id, code, title, csi_division)
       VALUES ($1, NULL, $2, $3, $4) ON CONFLICT (id) DO NOTHING`,
      [ID.cc(i), code, title, div]
    );
  }

  let mk = 0;
  for (let c = 0; c < COUNTY_FACTORS.length; c++) {
    const [fips, factor] = COUNTY_FACTORS[c];
    for (const [ccIdx, uom, labor, material] of MARKET_BASE) {
      const f = Number(factor);
      await client.query(
        `INSERT INTO market_cost_items
           (id, county_fips, msa_code, code, name, cost_code_id, uom,
            labor_unit_cost, material_unit_cost, source)
         VALUES ($1, $2, '47900', $3, $4, $5, $6, $7, $8, 'fixture')
         ON CONFLICT (id) DO NOTHING`,
        [
          ID.mk(mk++),
          fips,
          COST_CODES[ccIdx][0],
          `${COST_CODES[ccIdx][1]} (market)`,
          ID.cc(ccIdx),
          uom,
          (Number(labor) * f).toFixed(4),
          (Number(material) * f).toFixed(4),
        ]
      );
    }
  }

  for (let i = 0; i < CATALOG.length; i++) {
    const [ccIdx, name, uom] = CATALOG[i];
    await client.query(
      `INSERT INTO cost_items (id, org_id, name, cost_code_id, uom, source)
       VALUES ($1, $2, $3, $4, $5, 'manual') ON CONFLICT (id) DO NOTHING`,
      [ID.ci(i), TEST_ORG_ID, name, ID.cc(ccIdx), uom]
    );
  }

  let ac = 0;
  for (let a = 0; a < ASSEMBLIES.length; a++) {
    const [toggle, name, uom, components] = ASSEMBLIES[a];
    await client.query(
      `INSERT INTO assemblies (id, org_id, name, uom, parameters)
       VALUES ($1, $2, $3, $4, $5) ON CONFLICT (id) DO NOTHING`,
      [ID.as(a), TEST_ORG_ID, name, uom, JSON.stringify(SCOPE_MAP_BINDINGS[toggle] ?? {})]
    );
    for (const [ciIdx, formula] of components) {
      await client.query(
        `INSERT INTO assembly_components (id, org_id, assembly_id, cost_item_id, quantity_formula)
         VALUES ($1, $2, $3, $4, $5) ON CONFLICT (id) DO NOTHING`,
        [ID.ac(ac++), TEST_ORG_ID, ID.as(a), ID.ci(ciIdx), formula]
      );
    }
    await client.query(
      `INSERT INTO scope_assembly_map (id, org_id, scope_toggle, scope_class, assembly_id, priority, param_bindings)
       VALUES ($1, $2, $3, NULL, $4, 0, $5) ON CONFLICT (id) DO NOTHING`,
      [ID.sm(a), TEST_ORG_ID, toggle, ID.as(a), JSON.stringify(SCOPE_MAP_BINDINGS[toggle] ?? {})]
    );
  }

  for (let i = 0; i < MODIFIERS.length; i++) {
    const [dimension, key, multiplier, widen] = MODIFIERS[i];
    await client.query(
      `INSERT INTO assembly_modifiers (id, org_id, assembly_id, dimension, dim_key, multiplier, range_widen_pct)
       VALUES ($1, $2, NULL, $3, $4, $5, $6) ON CONFLICT (id) DO NOTHING`,
      [ID.mo(i), TEST_ORG_ID, dimension, key, multiplier, widen]
    );
  }

  const MARKUPS = [
    [0, 1, "Overhead", "10"],
    [1, 2, "Profit", "10"],
  ];
  for (const [i, order, name, pct] of MARKUPS) {
    await client.query(
      `INSERT INTO markup_templates (id, org_id, apply_order, name, markup_kind, rate_pct)
       VALUES ($1, $2, $3, $4, 'pct_of_running_total', $5) ON CONFLICT (id) DO NOTHING`,
      [ID.mt(i), TEST_ORG_ID, order, name, pct]
    );
  }

  return {
    cost_codes: COST_CODES.length,
    market_rows: mk,
    assemblies: ASSEMBLIES.length,
    modifiers: MODIFIERS.length,
  };
}
