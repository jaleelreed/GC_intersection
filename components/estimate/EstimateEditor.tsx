"use client";
// US-014/015: the editor. Edit qty/unit, delete a line, add a line, adjust
// markups — the line total, base, markups, and RANGE preview update live.
// Provenance badge per line. Save writes a new version via the engine.
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { EditorEstimate, CostCodeOption } from "../../lib/estimate/read";

const money = (n: number) => `$${n.toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
const round2 = (n: number) => Math.round(n * 100) / 100;

type Draft = Record<string, { quantity: string; unit_cost: string }>;
type NewRow = { key: string; description: string; cost_code_id: string; uom: string; quantity: string; unit_cost: string };

const UOMS = ["EA", "SF", "LF", "SY", "SQ", "CY", "HR", "DAY", "LS", "ALLOW", "GAL"];

export function EstimateEditor({
  estimate,
  costCodes,
}: {
  estimate: EditorEstimate;
  costCodes: CostCodeOption[];
}) {
  const router = useRouter();
  const [draft, setDraft] = useState<Draft>(
    Object.fromEntries(estimate.lines.map((l) => [l.lineage_id, { quantity: l.quantity, unit_cost: l.unit_cost }]))
  );
  const [deleted, setDeleted] = useState<Set<string>>(new Set());
  const [flags, setFlags] = useState<Record<string, { is_allowance: boolean; is_alternate: boolean }>>(
    Object.fromEntries(estimate.lines.map((l) => [l.lineage_id, { is_allowance: l.is_allowance, is_alternate: l.is_alternate }]))
  );
  const [adds, setAdds] = useState<NewRow[]>([]);
  const [markupRates, setMarkupRates] = useState<Record<string, string>>(
    Object.fromEntries(estimate.markups.map((m) => [m.name, m.rate_pct ?? ""]))
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const grand0 = Number(estimate.grandTotal);
  const widenFraction =
    estimate.rangeLow != null && grand0 > 0 ? (grand0 - Number(estimate.rangeLow)) / grand0 : 0;

  const preview = useMemo(() => {
    let base = 0;
    for (const l of estimate.lines) {
      if (deleted.has(l.lineage_id)) continue;
      if (flags[l.lineage_id]?.is_alternate) continue; // alternates are optional add-ons
      const d = draft[l.lineage_id];
      base += round2(Number(d.quantity) * Number(d.unit_cost));
    }
    for (const a of adds) {
      if (a.quantity && a.unit_cost) base += round2(Number(a.quantity) * Number(a.unit_cost));
    }
    let running = base;
    for (const m of estimate.markups) {
      if (m.markup_kind === "fixed") continue;
      const rate = Number(markupRates[m.name] ?? m.rate_pct ?? 0);
      running += round2((running * rate) / 100);
    }
    return {
      base,
      grand: running,
      low: round2(running * (1 - widenFraction)),
      high: round2(running * (1 + widenFraction)),
    };
  }, [draft, deleted, adds, markupRates, estimate.lines, estimate.markups, widenFraction]);

  const changedCount =
    estimate.lines.filter((l) => {
      const d = draft[l.lineage_id];
      return !deleted.has(l.lineage_id) && (d.quantity !== l.quantity || d.unit_cost !== l.unit_cost);
    }).length +
    deleted.size +
    adds.filter((a) => a.description.trim() && a.cost_code_id && a.quantity && a.unit_cost).length +
    estimate.markups.filter((m) => (markupRates[m.name] ?? "") !== (m.rate_pct ?? "")).length +
    estimate.lines.filter(
      (l) => flags[l.lineage_id].is_allowance !== l.is_allowance || flags[l.lineage_id].is_alternate !== l.is_alternate
    ).length;

  function set(lineage: string, field: "quantity" | "unit_cost", value: string) {
    setDraft((d) => ({ ...d, [lineage]: { ...d[lineage], [field]: value.replace(/[^0-9.]/g, "") } }));
  }
  function toggleFlag(lineage: string, field: "is_allowance" | "is_alternate") {
    setFlags((f) => ({ ...f, [lineage]: { ...f[lineage], [field]: !f[lineage][field] } }));
  }
  function toggleDelete(lineage: string) {
    setDeleted((s) => {
      const n = new Set(s);
      n.has(lineage) ? n.delete(lineage) : n.add(lineage);
      return n;
    });
  }
  function addRow() {
    setAdds((a) => [
      ...a,
      { key: `n${a.length}-${Math.round(preview.base)}`, description: "", cost_code_id: costCodes[0]?.id ?? "", uom: "EA", quantity: "1", unit_cost: "0" },
    ]);
  }
  function setAdd(key: string, field: keyof NewRow, value: string) {
    setAdds((a) => a.map((r) => (r.key === key ? { ...r, [field]: value } : r)));
  }

  async function save() {
    if (changedCount === 0) return;
    setBusy(true);
    setError(null);
    const edits = estimate.lines
      .filter((l) => !deleted.has(l.lineage_id) && (draft[l.lineage_id].quantity !== l.quantity || draft[l.lineage_id].unit_cost !== l.unit_cost))
      .map((l) => ({ lineage_id: l.lineage_id, quantity: draft[l.lineage_id].quantity, unit_cost: draft[l.lineage_id].unit_cost }));
    const validAdds = adds
      .filter((a) => a.description.trim() && a.cost_code_id && a.quantity && a.unit_cost)
      .map((a) => ({ description: a.description.trim(), cost_code_id: a.cost_code_id, uom: a.uom, quantity: a.quantity, unit_cost: a.unit_cost }));
    const markups = estimate.markups
      .filter((m) => (markupRates[m.name] ?? "") !== (m.rate_pct ?? ""))
      .map((m) => ({ name: m.name, rate_pct: markupRates[m.name] || "0" }));
    const flagEdits = estimate.lines
      .filter((l) => flags[l.lineage_id].is_allowance !== l.is_allowance || flags[l.lineage_id].is_alternate !== l.is_alternate)
      .map((l) => ({ lineage_id: l.lineage_id, is_allowance: flags[l.lineage_id].is_allowance, is_alternate: flags[l.lineage_id].is_alternate }));
    try {
      const res = await fetch(`/api/estimate/${estimate.versionId}/edit`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ edits, deletes: [...deleted], adds: validAdds, markups, flags: flagEdits }),
      });
      const data = await res.json();
      if (!res.ok) setError(data.error ?? "Save failed.");
      else {
        router.push(`/app/lead/${estimate.submissionId}`);
        router.refresh();
      }
    } catch {
      setError("Network problem — your edits are still here. Try again.");
    } finally {
      setBusy(false);
    }
  }

  const pill = "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold";
  const cellInput =
    "w-full rounded-lg border border-line bg-surface px-2 py-1.5 text-sm text-ink tabular-nums transition-colors focus:border-accent focus:outline-none focus:ring-2 focus:ring-[color:var(--accent-soft)] disabled:opacity-50";
  const cellSelect =
    "w-full rounded-lg border border-line bg-surface px-2 py-1.5 text-sm text-ink transition-colors focus:border-accent focus:outline-none";
  const badge = (seed: string, edited: boolean) =>
    edited ? <span className={`${pill} bg-accent-soft text-accent`}>edited</span> :
    seed === "learned" ? <span className={`${pill} bg-accent-soft text-accent`}>learned</span> :
    <span className={`${pill} bg-raised text-muted`}>market</span>;

  return (
    <div className="mt-6">
      {error && (
        <div className="mb-4 rounded-xl border border-danger bg-accent-soft p-4 text-sm text-ink" role="alert"><p>{error}</p></div>
      )}
      <div className="ui-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-line text-left text-xs font-semibold uppercase tracking-wide text-faint">
                <th className="px-4 py-3 font-semibold">Item</th>
                <th className="px-3 py-3 font-semibold">Qty</th>
                <th className="px-3 py-3 font-semibold">Unit</th>
                <th className="px-3 py-3 text-right font-semibold">Unit $</th>
                <th className="px-3 py-3 text-right font-semibold">Total</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {estimate.lines.map((l) => {
                const d = draft[l.lineage_id];
                const isDel = deleted.has(l.lineage_id);
                const fl = flags[l.lineage_id];
                const total = round2(Number(d.quantity) * Number(d.unit_cost));
                const edited = !isDel && (d.quantity !== l.quantity || d.unit_cost !== l.unit_cost);
                const rowTint = isDel
                  ? "opacity-50 [&_td>div:first-child]:line-through"
                  : fl.is_alternate
                    ? "bg-raised"
                    : edited
                      ? "bg-accent-soft"
                      : "";
                return (
                  <tr key={l.lineage_id} className={`border-b border-line align-top ${rowTint}`}>
                    <td className="px-4 py-3">
                      <div className="font-medium text-ink">{l.description}</div>
                      <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-muted">
                        {l.cost_code} {badge(l.seed_source, edited)}
                        {fl.is_allowance && <span className={`${pill} bg-raised text-muted`}>allowance</span>}
                        {fl.is_alternate && <span className={`${pill} bg-accent-soft text-accent`}>alternate</span>}
                      </div>
                    </td>
                    <td className="px-3 py-3"><input inputMode="decimal" value={d.quantity} disabled={isDel} onChange={(e) => set(l.lineage_id, "quantity", e.target.value)} aria-label={`quantity for ${l.description}`} className={`${cellInput} w-20 text-right`} /></td>
                    <td className="px-3 py-3 text-muted">{l.uom}</td>
                    <td className="px-3 py-3 text-right"><input inputMode="decimal" value={d.unit_cost} disabled={isDel} onChange={(e) => set(l.lineage_id, "unit_cost", e.target.value)} aria-label={`unit cost for ${l.description}`} className={`${cellInput} w-24 text-right`} /></td>
                    <td className="px-3 py-3 text-right font-medium tabular-nums text-ink">{money(total)}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-1">
                        <button type="button" className="ui-btn ui-btn-quiet text-xs" title="Allowance (a budgeted line the buyer may adjust)" onClick={() => toggleFlag(l.lineage_id, "is_allowance")}>
                          {fl.is_allowance ? "✓allow" : "allow"}
                        </button>
                        <button type="button" className="ui-btn ui-btn-quiet text-xs" title="Alternate (optional add-on, excluded from the total)" onClick={() => toggleFlag(l.lineage_id, "is_alternate")}>
                          {fl.is_alternate ? "✓alt" : "alt"}
                        </button>
                        <button type="button" className="ui-btn ui-btn-quiet text-xs" onClick={() => toggleDelete(l.lineage_id)}>
                          {isDel ? "undo" : "remove"}
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
              {adds.map((a) => (
                <tr key={a.key} className="border-b border-line align-top" style={{ background: "color-mix(in srgb, var(--positive) 8%, transparent)" }}>
                  <td className="px-4 py-3">
                    <input placeholder="Description" value={a.description} onChange={(e) => setAdd(a.key, "description", e.target.value)} className={`${cellInput} mb-2`} />
                    <select value={a.cost_code_id} onChange={(e) => setAdd(a.key, "cost_code_id", e.target.value)} aria-label="cost code" className={cellSelect}>
                      {costCodes.map((c) => <option key={c.id} value={c.id}>{c.code} {c.title}</option>)}
                    </select>
                  </td>
                  <td className="px-3 py-3"><input inputMode="decimal" value={a.quantity} onChange={(e) => setAdd(a.key, "quantity", e.target.value.replace(/[^0-9.]/g, ""))} className={`${cellInput} w-20 text-right`} /></td>
                  <td className="px-3 py-3">
                    <select value={a.uom} onChange={(e) => setAdd(a.key, "uom", e.target.value)} aria-label="unit" className={cellSelect}>
                      {UOMS.map((u) => <option key={u} value={u}>{u}</option>)}
                    </select>
                  </td>
                  <td className="px-3 py-3 text-right"><input inputMode="decimal" value={a.unit_cost} onChange={(e) => setAdd(a.key, "unit_cost", e.target.value.replace(/[^0-9.]/g, ""))} className={`${cellInput} w-24 text-right`} /></td>
                  <td className="px-3 py-3 text-right font-medium tabular-nums text-ink">{money(round2(Number(a.quantity) * Number(a.unit_cost)))}</td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end">
                      <button type="button" className="ui-btn ui-btn-quiet text-xs" onClick={() => setAdds((x) => x.filter((r) => r.key !== a.key))}>remove</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <button type="button" className="ui-btn ui-btn-ghost mt-4" onClick={addRow}>+ Add a line</button>

      <div className="ui-card mt-6 p-5">
        <h3 className="text-base font-bold text-ink">Markups</h3>
        <div className="mt-3 space-y-2">
          {estimate.markups.map((m) => (
            <label key={m.name} className="flex items-center gap-3">
              <span className="flex-1 text-sm text-ink">{m.name}</span>
              <input
                inputMode="decimal"
                value={markupRates[m.name] ?? ""}
                onChange={(e) => setMarkupRates((r) => ({ ...r, [m.name]: e.target.value.replace(/[^0-9.]/g, "") }))}
                aria-label={`${m.name} percent`}
                className={`${cellInput} w-24 text-right`}
              />
              <span className="text-sm text-muted">%</span>
            </label>
          ))}
        </div>
      </div>

      <div className="sticky bottom-0 mt-6 flex flex-wrap items-center justify-between gap-4 border-t border-line bg-surface/95 py-4 backdrop-blur-md">
        <div>
          <div className="font-display text-2xl font-bold tabular-nums text-ink">{money(preview.low)} – {money(preview.high)}</div>
          <div className="mt-0.5 text-sm text-muted">Total {money(preview.grand)} · seeded from county data, your edit is the price</div>
        </div>
        <button className="ui-btn ui-btn-primary" disabled={busy || changedCount === 0} onClick={save}>
          {busy ? "Saving…" : changedCount === 0 ? "No changes" : `Save (${changedCount})`}
        </button>
      </div>
    </div>
  );
}
