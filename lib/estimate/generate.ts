// US-010/US-011: the seed engine. Deterministic: same submission → same
// draft, to the cent (the replay test enforces it). Every number traces to a
// seed row, a modifier row, or this trace — never a guess. Unknowns WIDEN
// the range; they never default silently.
import type { PoolClient } from "pg";
import { evaluateFormula } from "./formula";
import { toScaled, mulScaled, applyMultiplier, scaledToString, scaledToCentsString, type Scaled } from "./money";
import { assertConvertibleLine } from "./lines";
import { SCOPE_TOGGLE_KEYS } from "../intake/schema";

// [seed] engine-level uncertainty constants (contracts §US-011).
const BASE_WIDEN_PCT = 12;
const COUNTY_FALLBACK_WIDEN_PCT = 6; // priced from regional rows, not the county
const COUNTY_UNKNOWN_WIDEN_PCT = 6; // county underivable from the zip

export interface GenerationResult {
  estimateId: string;
  versionId: string;
  rangeLowCents: string;
  rangeHighCents: string;
  grandTotalCents: string;
  swingDrivers: { driver: string; widen_amount_pct: number; source: string }[];
  unpricedToggles: string[];
}

interface SubmissionRow {
  id: string;
  org_id: string;
  county_fips: string | null;
  square_footage: string | null;
  address_line1: string;
  scope_toggles: Record<string, { on: boolean; class: string | null }>;
  conditions: {
    year_built: number | null;
    occupied: boolean | null;
    access: string | null;
    known_problems: string[];
  };
  finish_tier: string | null;
}

interface ModifierRow {
  dimension: string;
  dim_key: string;
  multiplier: string;
  range_widen_pct: string;
}

function conditionKeys(sub: SubmissionRow): { applied: string[]; problems: number } {
  const c = sub.conditions ?? { year_built: null, occupied: null, access: null, known_problems: [] };
  const keys: string[] = [];
  if (c.year_built == null) keys.push("year_built_unknown");
  else if (c.year_built < 1940) keys.push("pre_1940");
  else if (c.year_built <= 1977) keys.push("1940_1977");
  if (c.occupied === true) keys.push("occupied");
  else if (c.occupied == null) keys.push("occupied_unknown");
  if (c.access === "difficult") keys.push("access_difficult");
  else if (c.access == null) keys.push("access_unknown");
  const problems = (c.known_problems ?? []).filter((p) => p !== "none").length;
  return { applied: keys, problems };
}

export async function generateDraftEstimate(
  client: PoolClient,
  sub: SubmissionRow,
  projectId: string
): Promise<GenerationResult> {
  const sqft = sub.square_footage == null ? null : Number(sub.square_footage);
  if (sqft == null || !(sqft > 0)) {
    throw new Error("square_footage is required to generate a draft");
  }

  const modifiers: ModifierRow[] = (
    await client.query(
      `SELECT dimension, dim_key, multiplier, range_widen_pct
       FROM assembly_modifiers
       WHERE (org_id = $1 OR org_id IS NULL) AND assembly_id IS NULL AND deleted_at IS NULL
       ORDER BY dimension, dim_key`,
      [sub.org_id]
    )
  ).rows;
  const mod = (dimension: string, key: string): ModifierRow | undefined =>
    modifiers.find((m) => m.dimension === dimension && m.dim_key === key);

  // --- which dimensions apply (identical for every line) ------------------
  const cond = conditionKeys(sub);
  const tierKey = sub.finish_tier ?? "unknown";

  const globalMults: { row: ModifierRow; source: string }[] = [];
  for (const key of cond.applied) {
    const m = mod("condition", key);
    if (m) globalMults.push({ row: m, source: `condition:${key}` });
  }
  const tierMod = mod("finish_tier", tierKey);
  if (tierMod) globalMults.push({ row: tierMod, source: `finish_tier:${tierKey}` });

  // --- fire assemblies ----------------------------------------------------
  const onToggles = SCOPE_TOGGLE_KEYS.filter((k) => sub.scope_toggles?.[k]?.on);
  const mapRows = (
    await client.query(
      `SELECT m.id AS map_row_id, m.scope_toggle, m.assembly_id, m.param_bindings, a.name AS assembly_name
       FROM scope_assembly_map m
       JOIN assemblies a ON a.id = m.assembly_id AND a.deleted_at IS NULL
       WHERE m.org_id = $1 AND m.is_active AND m.deleted_at IS NULL
         AND m.scope_toggle = ANY($2)
       ORDER BY m.scope_toggle, m.priority DESC, m.id`,
      [sub.org_id, onToggles]
    )
  ).rows;
  const mappedToggles = new Set(mapRows.map((r) => r.scope_toggle));
  const unpricedToggles: string[] = onToggles.filter((t) => !mappedToggles.has(t));

  const formulaContext = { "submission.square_footage": sqft };

  const lines: {
    sort_order: number;
    cost_code_id: string;
    description: string;
    cost_item_id: string;
    assembly_id: string;
    quantity: string;
    uom: string;
    unit_cost: string;
    total: string;
    benchmark_unit_cost: string;
    market_cost_item_id: string | null;
    seed_source: string;
    totalScaled: Scaled;
  }[] = [];
  const assembliesFired: unknown[] = [];
  const modifiersApplied: unknown[] = [];
  const precedenceLog: unknown[] = [];
  const appliedWiden = new Map<string, { pct: number; source: string }>();
  let countyFellBack = false;

  const addWiden = (key: string, pct: number, source: string) => {
    if (!appliedWiden.has(key)) appliedWiden.set(key, { pct, source });
  };

  for (const g of globalMults) {
    modifiersApplied.push({
      dimension: g.row.dimension,
      dim_key: g.row.dim_key,
      multiplier: g.row.multiplier,
      range_widen_pct: g.row.range_widen_pct,
    });
    addWiden(g.source, Number(g.row.range_widen_pct), g.source);
  }
  if (cond.problems > 0) {
    const m = mod("condition", "known_problem");
    if (m) {
      const pct = Number(m.range_widen_pct) * cond.problems;
      addWiden("known_problems", pct, `condition:known_problem x${cond.problems}`);
      modifiersApplied.push({ dimension: "condition", dim_key: "known_problem", count: cond.problems });
    }
  }

  let sortOrder = 0;
  for (const row of mapRows) {
    const toggleClass = sub.scope_toggles[row.scope_toggle]?.class ?? null;
    const classKey = toggleClass ?? "unknown";
    const classMod = mod("scope_class", classKey);
    if (classMod) {
      addWiden(`scope_class:${classKey}`, Number(classMod.range_widen_pct), `${row.scope_toggle} scope_class:${classKey}`);
    }

    const params: Record<string, number> = {};
    const bindings = row.param_bindings as Record<string, string>;
    for (const [name, formula] of Object.entries(bindings)) {
      params[name] = evaluateFormula(formula, formulaContext);
    }
    assembliesFired.push({
      scope_toggle: row.scope_toggle,
      scope_class: toggleClass,
      assembly_id: row.assembly_id,
      map_row_id: row.map_row_id,
      params,
    });

    const components = (
      await client.query(
        `SELECT c.quantity_formula, i.id AS cost_item_id, i.name, i.cost_code_id, i.uom
         FROM assembly_components c
         JOIN cost_items i ON i.id = c.cost_item_id AND i.deleted_at IS NULL
         WHERE c.assembly_id = $1 AND c.deleted_at IS NULL
         ORDER BY c.id`,
        [row.assembly_id]
      )
    ).rows;

    for (const comp of components) {
      const qty = evaluateFormula(comp.quantity_formula, params);
      if (!(qty > 0)) continue;

      // US-021 precedence: a learned org cost (harvested from this GC's own
      // edits) ALWAYS beats the market seed for the same cost code.
      const learned = (
        await client.query(
          `SELECT id, labor_unit_cost, material_unit_cost, equipment_unit_cost, sub_unit_cost
           FROM cost_items
           WHERE org_id = $1 AND cost_code_id = $2 AND source = 'harvested_bid'
             AND source_observation_id IS NOT NULL AND deleted_at IS NULL
           ORDER BY effective_date DESC, created_at DESC, id LIMIT 1`,
          [sub.org_id, comp.cost_code_id]
        )
      ).rows[0];

      // market lookup: county → any fixture row (regional fallback, named).
      let market = sub.county_fips
        ? (
            await client.query(
              `SELECT id, labor_unit_cost, material_unit_cost, equipment_unit_cost, sub_unit_cost
               FROM market_cost_items
               WHERE cost_code_id = $1 AND county_fips = $2 AND source = 'fixture' AND deleted_at IS NULL
               ORDER BY effective_date DESC, id LIMIT 1`,
              [comp.cost_code_id, sub.county_fips]
            )
          ).rows[0]
        : undefined;
      if (!market && !learned) {
        countyFellBack = true;
        market = (
          await client.query(
            `SELECT id, labor_unit_cost, material_unit_cost, equipment_unit_cost, sub_unit_cost
             FROM market_cost_items
             WHERE cost_code_id = $1 AND source = 'fixture' AND deleted_at IS NULL
             ORDER BY effective_date DESC, id LIMIT 1`,
            [comp.cost_code_id]
          )
        ).rows[0];
      }
      const priced = learned ?? market;
      if (!priced) {
        // No learned cost and no market row anywhere: honestly unpriced.
        unpricedToggles.push(`${row.scope_toggle}:${comp.name}`);
        continue;
      }
      const seedSource = learned ? "learned" : "market_seed";
      precedenceLog.push({
        cost_code_id: comp.cost_code_id,
        component: comp.name,
        winner: seedSource,
        cost_item_id: learned?.id ?? null,
        market_cost_item_id: learned ? null : market?.id ?? null,
      });

      const rawUnit: Scaled =
        toScaled(priced.labor_unit_cost) +
        toScaled(priced.material_unit_cost) +
        toScaled(priced.equipment_unit_cost) +
        toScaled(priced.sub_unit_cost);

      let unit = rawUnit;
      if (classMod) unit = applyMultiplier(unit, classMod.multiplier);
      for (const g of globalMults) unit = applyMultiplier(unit, g.row.multiplier);

      const qtyStr = qty.toFixed(4);
      const totalScaled = mulScaled(toScaled(qtyStr), unit);
      const line = {
        sort_order: sortOrder++,
        cost_code_id: comp.cost_code_id,
        description: comp.name,
        cost_item_id: comp.cost_item_id,
        assembly_id: row.assembly_id,
        quantity: qtyStr,
        uom: comp.uom,
        unit_cost: scaledToString(unit),
        total: scaledToCentsString(totalScaled),
        benchmark_unit_cost: scaledToString(rawUnit),
        market_cost_item_id: learned ? null : market?.id ?? null,
        seed_source: seedSource,
        totalScaled,
      };
      assertConvertibleLine({ ...line, cost_kind: "subcontract" });
      lines.push(line);
    }
  }

  // --- totals + markups ---------------------------------------------------
  let baseScaled: Scaled = 0n;
  for (const l of lines) baseScaled += toScaled(l.total);

  const markupRows = (
    await client.query(
      `SELECT name, markup_kind, rate_pct, fixed_amount
       FROM markup_templates
       WHERE org_id = $1 AND is_active AND deleted_at IS NULL
       ORDER BY apply_order`,
      [sub.org_id]
    )
  ).rows;

  let runningScaled = baseScaled;
  let markupScaled: Scaled = 0n;
  const computedMarkups: { name: string; markup_kind: string; rate_pct: string | null; fixed_amount: string | null; computed: string; apply_order: number }[] = [];
  markupRows.forEach((m, i) => {
    let amt: Scaled = 0n;
    if (m.markup_kind === "fixed" && m.fixed_amount != null) {
      amt = toScaled(m.fixed_amount);
    } else if (m.rate_pct != null) {
      const basis = m.markup_kind === "pct_of_base" ? baseScaled : runningScaled;
      amt = mulScaled(basis, toScaled((Number(m.rate_pct) / 100).toFixed(4)));
    }
    runningScaled += amt;
    markupScaled += amt;
    computedMarkups.push({
      name: m.name,
      markup_kind: m.markup_kind,
      rate_pct: m.rate_pct,
      fixed_amount: m.fixed_amount,
      computed: scaledToCentsString(amt),
      apply_order: i + 1,
    });
  });
  const grandScaled = runningScaled;

  // --- range --------------------------------------------------------------
  if (sub.county_fips == null) addWiden("county_unknown", COUNTY_UNKNOWN_WIDEN_PCT, "county underivable from zip");
  else if (countyFellBack) addWiden("county_fallback", COUNTY_FALLBACK_WIDEN_PCT, "priced from regional data");

  let widenTotal = BASE_WIDEN_PCT;
  const drivers: { driver: string; widen_amount_pct: number; source: string }[] = [
    { driver: "base concept uncertainty", widen_amount_pct: BASE_WIDEN_PCT, source: "engine:base" },
  ];
  for (const [key, w] of appliedWiden) {
    if (w.pct <= 0) continue;
    widenTotal += w.pct;
    drivers.push({ driver: key, widen_amount_pct: w.pct, source: w.source });
  }
  drivers.sort((a, b) => b.widen_amount_pct - a.widen_amount_pct);

  const widenMult = (widenTotal / 100).toFixed(4);
  const delta = mulScaled(grandScaled, toScaled(widenMult));
  const lowScaled = grandScaled - delta;
  const highScaled = grandScaled + delta;

  // --- persist ------------------------------------------------------------
  const estimate = (
    await client.query(
      `INSERT INTO estimates (org_id, project_id, name, status, class, intake_submission_id)
       VALUES ($1, $2, $3, 'draft', 'concept', $4) RETURNING id`,
      [sub.org_id, projectId, `Draft — ${sub.address_line1}`, sub.id]
    )
  ).rows[0];

  const version = (
    await client.query(
      `INSERT INTO estimate_versions
         (org_id, estimate_id, version_no, label, base_total, markup_total, grand_total,
          range_low, range_high, swing_drivers)
       VALUES ($1, $2, 1, 'Concept draft', $3, $4, $5, $6, $7, $8) RETURNING id`,
      [
        sub.org_id,
        estimate.id,
        scaledToCentsString(baseScaled),
        scaledToCentsString(markupScaled),
        scaledToCentsString(grandScaled),
        scaledToCentsString(lowScaled < 0n ? 0n : lowScaled),
        scaledToCentsString(highScaled),
        JSON.stringify(drivers),
      ]
    )
  ).rows[0];
  await client.query(`UPDATE estimates SET current_version_id = $2 WHERE id = $1`, [estimate.id, version.id]);

  for (const l of lines) {
    await client.query(
      `INSERT INTO estimate_lines
         (org_id, estimate_version_id, sort_order, cost_code_id, cost_kind, description,
          cost_item_id, assembly_id, quantity, uom, unit_cost, total,
          benchmark_unit_cost, seed_source, market_cost_item_id)
       VALUES ($1,$2,$3,$4,'subcontract',$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`,
      [
        sub.org_id, version.id, l.sort_order, l.cost_code_id, l.description,
        l.cost_item_id, l.assembly_id, l.quantity, l.uom, l.unit_cost, l.total,
        l.benchmark_unit_cost, l.seed_source, l.market_cost_item_id,
      ]
    );
  }
  for (const m of computedMarkups) {
    await client.query(
      `INSERT INTO estimate_markups (org_id, estimate_version_id, apply_order, name, markup_kind, rate_pct, fixed_amount, computed_amount)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
      [sub.org_id, version.id, m.apply_order, m.name, m.markup_kind, m.rate_pct, m.fixed_amount, m.computed]
    );
  }

  const unknowns = [
    ...drivers.filter((d) => d.driver.includes("unknown")).map((d) => ({ kind: "dimension_unknown", driver: d.driver, widen_pct: d.widen_amount_pct })),
    ...unpricedToggles.map((t) => ({ kind: "unpriced", toggle: t })),
  ];
  await client.query(
    `INSERT INTO estimate_generation_runs
       (org_id, intake_submission_id, estimate_version_id, cost_provider, provider_version,
        inputs_snapshot, assemblies_fired, modifiers_applied, precedence_log, unknowns,
        range_low, range_high, grand_total, completed_at)
     VALUES ($1,$2,$3,'FixtureCostProvider','fixture-v1',$4,$5,$6,$7,$8,$9,$10,$11, now())`,
    [
      sub.org_id, sub.id, version.id,
      JSON.stringify({
        square_footage: sqft,
        county_fips: sub.county_fips,
        scope_toggles: sub.scope_toggles,
        conditions: sub.conditions,
        finish_tier: sub.finish_tier,
      }),
      JSON.stringify(assembliesFired),
      JSON.stringify(modifiersApplied),
      JSON.stringify(precedenceLog),
      JSON.stringify(unknowns),
      scaledToCentsString(lowScaled < 0n ? 0n : lowScaled),
      scaledToCentsString(highScaled),
      scaledToCentsString(grandScaled),
    ]
  );

  return {
    estimateId: estimate.id,
    versionId: version.id,
    rangeLowCents: scaledToCentsString(lowScaled < 0n ? 0n : lowScaled),
    rangeHighCents: scaledToCentsString(highScaled),
    grandTotalCents: scaledToCentsString(grandScaled),
    swingDrivers: drivers,
    unpricedToggles,
  };
}
