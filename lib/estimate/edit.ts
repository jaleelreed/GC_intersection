// The convergence loop's write side.
// US-014 (engine half): versioned, never destructive — edits land on a NEW
//   version; lines keep lineage_id across versions (D8).
// US-019: every GC price edit writes a benchmark_observation keyed to the
//   feasibility dimensions of the job it came from.
// US-020: observations harvest into org cost_items (source_observation_id).
// D7 stands behind everything: the DB trigger refuses writes to locked versions.
import { getPool, setOrg, orgQuery } from "../db";
import { toScaled, mulScaled, scaledToCentsString, scaledToString } from "./money";
import { assertConvertibleLine } from "./lines";

export interface LineEdit {
  lineage_id: string;
  quantity?: string; // numeric strings — money discipline end to end
  unit_cost?: string;
  description?: string;
}

export interface NewLine {
  description: string;
  cost_code_id: string;
  uom: string;
  quantity: string;
  unit_cost: string;
}

export interface MarkupEdit {
  name: string;
  rate_pct: string;
}

export interface LineFlag {
  lineage_id: string;
  is_allowance?: boolean;
  is_alternate?: boolean;
}

export interface EditOptions {
  deletes?: string[]; // lineage_ids to remove in the new version
  adds?: NewLine[]; // GC-added lines (fresh lineage, seed_source gc_edit)
  markups?: MarkupEdit[]; // set rate_pct on existing markups by name
  flags?: LineFlag[]; // mark lines as allowance / alternate
  orgId?: string; // set the RLS org context up front (required in prod, where
  // estimate_versions is FORCE-RLS'd; omitted by superuser unit tests)
}

/**
 * Creates version N+1 as a faithful copy of the given version (lines keep
 * their lineage_id; markups copied), then applies edits to the new version.
 * Returns the new version id. The source version is never touched.
 */
export async function editIntoNewVersion(
  versionId: string,
  edits: LineEdit[],
  opts: EditOptions = {}
): Promise<{ newVersionId: string; editedLineageIds: string[] }> {
  const client = await getPool().connect();
  try {
    await client.query("BEGIN");
    // estimate_versions/estimates are FORCE-RLS'd; scope before reading them.
    // (Superuser unit tests omit orgId and bypass RLS; prod always passes it.)
    if (opts.orgId) await setOrg(client, opts.orgId);

    const src = (
      await client.query(
        `SELECT v.id, v.org_id, v.estimate_id, v.version_no, e.project_id, e.intake_submission_id
         FROM estimate_versions v JOIN estimates e ON e.id = v.estimate_id
         WHERE v.id = $1 AND v.deleted_at IS NULL FOR UPDATE`,
        [versionId]
      )
    ).rows[0];
    if (!src) throw new Error("version not found");
    // Set the org context for the FORCE-RLS'd cost_items harvest write below.
    await setOrg(client, src.org_id);

    const next = (
      await client.query(
        `INSERT INTO estimate_versions (org_id, estimate_id, version_no, label, base_total, markup_total, grand_total, swing_drivers)
         SELECT org_id, estimate_id,
                (SELECT max(version_no) + 1 FROM estimate_versions WHERE estimate_id = $2),
                'GC edit', 0, 0, 0, swing_drivers
         FROM estimate_versions WHERE id = $1
         RETURNING id`,
        [versionId, src.estimate_id]
      )
    ).rows[0];

    // Copy lines preserving lineage (the identity US-022 diffs on).
    await client.query(
      `INSERT INTO estimate_lines
         (org_id, estimate_version_id, sort_order, cost_code_id, cost_kind, description,
          cost_item_id, assembly_id, quantity, uom, unit_cost, total,
          benchmark_unit_cost, seed_source, market_cost_item_id, lineage_id)
       SELECT org_id, $2, sort_order, cost_code_id, cost_kind, description,
              cost_item_id, assembly_id, quantity, uom, unit_cost, total,
              benchmark_unit_cost, seed_source, market_cost_item_id, lineage_id
       FROM estimate_lines WHERE estimate_version_id = $1 AND deleted_at IS NULL`,
      [versionId, next.id]
    );
    await client.query(
      `INSERT INTO estimate_markups (org_id, estimate_version_id, apply_order, name, markup_kind, rate_pct, fixed_amount, computed_amount)
       SELECT org_id, $2, apply_order, name, markup_kind, rate_pct, fixed_amount, computed_amount
       FROM estimate_markups WHERE estimate_version_id = $1 AND deleted_at IS NULL`,
      [versionId, next.id]
    );

    // Job feasibility keys for observations (US-019).
    const job = (
      await client.query(
        `SELECT s.finish_tier, s.county_fips, s.scope_toggles, p.msa_code, p.state, p.gross_sf
         FROM intake_submissions s
         LEFT JOIN projects p ON p.id = s.project_id
         WHERE s.id = $1`,
        [src.intake_submission_id]
      )
    ).rows[0];

    const editedLineageIds: string[] = [];
    for (const edit of edits) {
      const line = (
        await client.query(
          `SELECT l.*, a.name AS assembly_name, m.scope_toggle
           FROM estimate_lines l
           LEFT JOIN assemblies a ON a.id = l.assembly_id
           LEFT JOIN scope_assembly_map m ON m.assembly_id = l.assembly_id AND m.deleted_at IS NULL
           WHERE l.estimate_version_id = $1 AND l.lineage_id = $2 AND l.deleted_at IS NULL`,
          [next.id, edit.lineage_id]
        )
      ).rows[0];
      if (!line) throw new Error(`no line with lineage ${edit.lineage_id} in new version`);

      const quantity = edit.quantity ?? line.quantity;
      const unit_cost = edit.unit_cost ?? line.unit_cost;
      const description = edit.description ?? line.description;
      const totalCents = scaledToCentsString(mulScaled(toScaled(quantity), toScaled(unit_cost)));

      assertConvertibleLine({
        cost_code_id: line.cost_code_id,
        cost_kind: line.cost_kind,
        description,
        quantity,
        uom: line.uom,
        unit_cost,
        total: totalCents,
        seed_source: "gc_edit",
      });

      await client.query(
        `UPDATE estimate_lines
         SET quantity = $2, unit_cost = $3, description = $4, total = $5, seed_source = 'gc_edit'
         WHERE id = $1`,
        [line.id, quantity, unit_cost, description, totalCents]
      );
      editedLineageIds.push(edit.lineage_id);

      // US-019: the edit IS the signal. Price edits only (unit_cost changed).
      if (edit.unit_cost && edit.unit_cost !== line.unit_cost) {
        const scopeClass = job?.scope_toggles?.[line.scope_toggle]?.class ?? null;
        await client.query(
          `INSERT INTO benchmark_observations
             (org_id, project_id, source_kind, source_table, source_id, cost_code_id,
              observed_on, total_amount, quantity, uom, unit_cost,
              amount_per_gsf, msa_code, state, sector,
              scope_class, finish_tier, condition_keys)
           VALUES ($1, $2, 'estimate', 'estimate_lines', $3, $4,
                   CURRENT_DATE, $5, $6, $7, $8,
                   $9, $10, $11, 'residential', $12, $13, $14)
           ON CONFLICT (source_table, source_id) DO UPDATE
             SET unit_cost = EXCLUDED.unit_cost,
                 total_amount = EXCLUDED.total_amount,
                 quantity = EXCLUDED.quantity`,
          [
            src.org_id,
            src.project_id,
            line.id,
            line.cost_code_id,
            totalCents,
            quantity,
            line.uom,
            unit_cost,
            job?.gross_sf ? scaledToString(toScaled((Number(totalCents) / Number(job.gross_sf)).toFixed(4))) : null,
            job?.msa_code ?? "47900",
            job?.state ?? null,
            scopeClass,
            job?.finish_tier ?? null,
            JSON.stringify({ county_fips: job?.county_fips ?? null }),
          ]
        );

        // US-020: harvest into the org cost database, provenance intact.
        const obs = (
          await client.query(
            `SELECT id FROM benchmark_observations WHERE source_table = 'estimate_lines' AND source_id = $1`,
            [line.id]
          )
        ).rows[0];
        await client.query(
          `INSERT INTO cost_items (org_id, name, cost_code_id, uom, sub_unit_cost, source, source_observation_id, msa_code)
           VALUES ($1, $2, $3, $4, $5, 'harvested_bid', $6, $7)`,
          [src.org_id, description, line.cost_code_id, line.uom, unit_cost, obs.id, job?.msa_code ?? "47900"]
        );
      }
    }

    // Deletes: soft-remove lines in the new version (source untouched).
    for (const lineage of opts.deletes ?? []) {
      await client.query(
        `UPDATE estimate_lines SET deleted_at = now()
         WHERE estimate_version_id = $1 AND lineage_id = $2 AND deleted_at IS NULL`,
        [next.id, lineage]
      );
    }

    // Adds: GC-authored lines. Fresh lineage, gc_edit provenance, invariant-checked.
    let addOrder = (
      await client.query(
        `SELECT coalesce(max(sort_order), 0) AS m FROM estimate_lines WHERE estimate_version_id = $1`,
        [next.id]
      )
    ).rows[0].m;
    for (const add of opts.adds ?? []) {
      const totalCents = scaledToCentsString(mulScaled(toScaled(add.quantity), toScaled(add.unit_cost)));
      assertConvertibleLine({
        cost_code_id: add.cost_code_id,
        cost_kind: "subcontract",
        description: add.description,
        quantity: add.quantity,
        uom: add.uom,
        unit_cost: add.unit_cost,
        total: totalCents,
        seed_source: "gc_edit",
      });
      await client.query(
        `INSERT INTO estimate_lines
           (org_id, estimate_version_id, sort_order, cost_code_id, cost_kind, description,
            quantity, uom, unit_cost, total, seed_source)
         VALUES ($1,$2,$3,$4,'subcontract',$5,$6,$7,$8,$9,'gc_edit')`,
        [src.org_id, next.id, ++addOrder, add.cost_code_id, add.description, add.quantity, add.uom, add.unit_cost, totalCents]
      );
    }

    // Markup rate edits (matched by name; retotal recomputes amounts).
    for (const m of opts.markups ?? []) {
      await client.query(
        `UPDATE estimate_markups SET rate_pct = $3
         WHERE estimate_version_id = $1 AND name = $2 AND deleted_at IS NULL`,
        [next.id, m.name, m.rate_pct]
      );
    }

    // Line flags: allowance / alternate. Alternates are OPTIONAL adds — they
    // are excluded from the base total below.
    for (const f of opts.flags ?? []) {
      const sets: string[] = [];
      const params: unknown[] = [next.id, f.lineage_id];
      if (f.is_allowance !== undefined) { params.push(f.is_allowance); sets.push(`is_allowance = $${params.length}`); }
      if (f.is_alternate !== undefined) { params.push(f.is_alternate); sets.push(`is_alternate = $${params.length}`); }
      if (sets.length === 0) continue;
      await client.query(
        `UPDATE estimate_lines SET ${sets.join(", ")}
         WHERE estimate_version_id = $1 AND lineage_id = $2 AND deleted_at IS NULL`,
        params
      );
    }

    // Retotal: base excludes ALTERNATE lines (optional add-ons priced but not
    // in the accepted total). Allowances stay in.
    const base = (
      await client.query(
        `SELECT coalesce(sum(total), 0) AS t FROM estimate_lines
         WHERE estimate_version_id = $1 AND deleted_at IS NULL AND is_alternate = false`,
        [next.id]
      )
    ).rows[0].t;
    let running = toScaled(String(base));
    let markupTotal = 0n;
    const markups = (
      await client.query(
        `SELECT id, markup_kind, rate_pct, fixed_amount FROM estimate_markups
         WHERE estimate_version_id = $1 AND deleted_at IS NULL ORDER BY apply_order`,
        [next.id]
      )
    ).rows;
    for (const m of markups) {
      let amt = 0n;
      if (m.markup_kind === "fixed" && m.fixed_amount != null) amt = toScaled(m.fixed_amount);
      else if (m.rate_pct != null) {
        const basis = m.markup_kind === "pct_of_base" ? toScaled(String(base)) : running;
        amt = mulScaled(basis, toScaled((Number(m.rate_pct) / 100).toFixed(4)));
      }
      running += amt;
      markupTotal += amt;
      await client.query(`UPDATE estimate_markups SET computed_amount = $2 WHERE id = $1`, [
        m.id,
        scaledToCentsString(amt),
      ]);
    }
    await client.query(
      `UPDATE estimate_versions SET base_total = $2, markup_total = $3, grand_total = $4 WHERE id = $1`,
      [next.id, scaledToCentsString(toScaled(String(base))), scaledToCentsString(markupTotal), scaledToCentsString(running)]
    );
    await client.query(`UPDATE estimates SET current_version_id = $2 WHERE id = $1`, [src.estimate_id, next.id]);

    await client.query("COMMIT");
    return { newVersionId: next.id, editedLineageIds };
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

/**
 * US-022: edit metrics between two versions of the same estimate, computed
 * over stable lineage ids. edit_coverage = touched lines / prior lines —
 * the trust-floor metric (D10: wide launch when < 1/3 for a friendly's jobs).
 */
export async function editMetrics(
  orgId: string,
  fromVersionId: string,
  toVersionId: string
): Promise<{ priorLines: number; touched: number; editCoverage: number }> {
  const r = await orgQuery(
    orgId,
    `SELECT
       count(a.lineage_id)::int AS prior,
       count(b.lineage_id) FILTER (
         WHERE b.lineage_id IS NOT NULL AND
               (a.quantity <> b.quantity OR a.unit_cost <> b.unit_cost OR a.description <> b.description)
       )::int AS touched
     FROM estimate_lines a
     LEFT JOIN estimate_lines b
       ON b.lineage_id = a.lineage_id AND b.estimate_version_id = $2 AND b.deleted_at IS NULL
     WHERE a.estimate_version_id = $1 AND a.deleted_at IS NULL`,
    [fromVersionId, toVersionId]
  );
  const { prior, touched } = r.rows[0];
  return { priorLines: prior, touched, editCoverage: prior === 0 ? 0 : touched / prior };
}
