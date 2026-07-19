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
    estimate.markups.filter((m) => (markupRates[m.name] ?? "") !== (m.rate_pct ?? "")).length;

  function set(lineage: string, field: "quantity" | "unit_cost", value: string) {
    setDraft((d) => ({ ...d, [lineage]: { ...d[lineage], [field]: value.replace(/[^0-9.]/g, "") } }));
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
    try {
      const res = await fetch(`/api/estimate/${estimate.versionId}/edit`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ edits, deletes: [...deleted], adds: validAdds, markups }),
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

  const badge = (seed: string, edited: boolean) =>
    edited ? <span className="gci-prov gci-prov-edited">edited</span> :
    seed === "learned" ? <span className="gci-prov gci-prov-learned">learned</span> :
    <span className="gci-prov gci-prov-market">market</span>;

  return (
    <div>
      {error && (
        <div className="gci-errors" role="alert"><p>{error}</p></div>
      )}
      <table className="gci-lines">
        <thead>
          <tr><th>Item</th><th>Qty</th><th>Unit</th><th className="num">Unit $</th><th className="num">Total</th><th></th></tr>
        </thead>
        <tbody>
          {estimate.lines.map((l) => {
            const d = draft[l.lineage_id];
            const isDel = deleted.has(l.lineage_id);
            const total = round2(Number(d.quantity) * Number(d.unit_cost));
            const edited = !isDel && (d.quantity !== l.quantity || d.unit_cost !== l.unit_cost);
            return (
              <tr key={l.lineage_id} className={isDel ? "gci-del-row" : edited ? "gci-edited-row" : ""}>
                <td>
                  <div>{l.description}</div>
                  <div className="gci-linemeta">{l.cost_code} {badge(l.seed_source, edited)}</div>
                </td>
                <td><input inputMode="decimal" value={d.quantity} disabled={isDel} onChange={(e) => set(l.lineage_id, "quantity", e.target.value)} aria-label={`quantity for ${l.description}`} /></td>
                <td>{l.uom}</td>
                <td className="num"><input inputMode="decimal" value={d.unit_cost} disabled={isDel} onChange={(e) => set(l.lineage_id, "unit_cost", e.target.value)} aria-label={`unit cost for ${l.description}`} /></td>
                <td className="num">{money(total)}</td>
                <td>
                  <button type="button" className="gci-linkbtn" onClick={() => toggleDelete(l.lineage_id)}>
                    {isDel ? "undo" : "remove"}
                  </button>
                </td>
              </tr>
            );
          })}
          {adds.map((a) => (
            <tr key={a.key} className="gci-add-row">
              <td>
                <input placeholder="Description" value={a.description} onChange={(e) => setAdd(a.key, "description", e.target.value)} className="gci-wideinput" />
                <select value={a.cost_code_id} onChange={(e) => setAdd(a.key, "cost_code_id", e.target.value)} aria-label="cost code">
                  {costCodes.map((c) => <option key={c.id} value={c.id}>{c.code} {c.title}</option>)}
                </select>
              </td>
              <td><input inputMode="decimal" value={a.quantity} onChange={(e) => setAdd(a.key, "quantity", e.target.value.replace(/[^0-9.]/g, ""))} /></td>
              <td>
                <select value={a.uom} onChange={(e) => setAdd(a.key, "uom", e.target.value)} aria-label="unit">
                  {UOMS.map((u) => <option key={u} value={u}>{u}</option>)}
                </select>
              </td>
              <td className="num"><input inputMode="decimal" value={a.unit_cost} onChange={(e) => setAdd(a.key, "unit_cost", e.target.value.replace(/[^0-9.]/g, ""))} /></td>
              <td className="num">{money(round2(Number(a.quantity) * Number(a.unit_cost)))}</td>
              <td><button type="button" className="gci-linkbtn" onClick={() => setAdds((x) => x.filter((r) => r.key !== a.key))}>remove</button></td>
            </tr>
          ))}
        </tbody>
      </table>

      <button type="button" className="gci-btn" onClick={addRow}>+ Add a line</button>

      <div className="gci-markups">
        <h3>Markups</h3>
        {estimate.markups.map((m) => (
          <label key={m.name} className="gci-markup-row">
            <span>{m.name}</span>
            <input
              inputMode="decimal"
              value={markupRates[m.name] ?? ""}
              onChange={(e) => setMarkupRates((r) => ({ ...r, [m.name]: e.target.value.replace(/[^0-9.]/g, "") }))}
              aria-label={`${m.name} percent`}
            />
            <span>%</span>
          </label>
        ))}
      </div>

      <div className="gci-editbar">
        <div>
          <div className="gci-range">{money(preview.low)} – {money(preview.high)}</div>
          <div className="gci-hint">Total {money(preview.grand)} · seeded from county data, your edit is the price</div>
        </div>
        <button className="gci-primary" disabled={busy || changedCount === 0} onClick={save}>
          {busy ? "Saving…" : changedCount === 0 ? "No changes" : `Save (${changedCount})`}
        </button>
      </div>
    </div>
  );
}
