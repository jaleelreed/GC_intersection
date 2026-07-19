"use client";
// US-014/015: the editor. Edit qty/unit on any line; the line total, the base,
// the markups, and the RANGE preview update live. Provenance badge per line
// (market / learned / edited). Save writes a new version via the engine and
// returns to the reveal. Editing beats authoring (SOV correction, §15).
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { EditorEstimate } from "../../lib/estimate/read";

const money = (n: number) => `$${n.toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
const round2 = (n: number) => Math.round(n * 100) / 100;

type Draft = Record<string, { quantity: string; unit_cost: string }>;

export function EstimateEditor({ estimate }: { estimate: EditorEstimate }) {
  const router = useRouter();
  const [draft, setDraft] = useState<Draft>(
    Object.fromEntries(estimate.lines.map((l) => [l.lineage_id, { quantity: l.quantity, unit_cost: l.unit_cost }]))
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Band % is driven by feasibility dimensions, not prices, so it is stable
  // across price edits — the preview range is exact.
  const grand0 = Number(estimate.grandTotal);
  const widenFraction =
    estimate.rangeLow != null && grand0 > 0 ? (grand0 - Number(estimate.rangeLow)) / grand0 : 0;

  const preview = useMemo(() => {
    const base = estimate.lines.reduce((sum, l) => {
      const d = draft[l.lineage_id];
      return sum + round2(Number(d.quantity) * Number(d.unit_cost));
    }, 0);
    let running = base;
    for (const m of estimate.markups) {
      if (m.markup_kind === "fixed") continue; // fixed amounts unchanged in preview
      if (m.rate_pct != null) running += round2((running * Number(m.rate_pct)) / 100);
    }
    return {
      base,
      grand: running,
      low: round2(running * (1 - widenFraction)),
      high: round2(running * (1 + widenFraction)),
    };
  }, [draft, estimate.lines, estimate.markups, widenFraction]);

  const changed = estimate.lines.filter((l) => {
    const d = draft[l.lineage_id];
    return d.quantity !== l.quantity || d.unit_cost !== l.unit_cost;
  });

  function set(lineage: string, field: "quantity" | "unit_cost", value: string) {
    setDraft((d) => ({ ...d, [lineage]: { ...d[lineage], [field]: value.replace(/[^0-9.]/g, "") } }));
  }

  async function save() {
    if (changed.length === 0) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/estimate/${estimate.versionId}/edit`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          edits: changed.map((l) => ({
            lineage_id: l.lineage_id,
            quantity: draft[l.lineage_id].quantity,
            unit_cost: draft[l.lineage_id].unit_cost,
          })),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Save failed.");
      } else {
        router.push(`/app/lead/${estimate.submissionId}`);
        router.refresh();
      }
    } catch {
      setError("Network problem — your edits are still here. Try again.");
    } finally {
      setBusy(false);
    }
  }

  const badge = (seed: string) =>
    seed === "learned" ? (
      <span className="gci-prov gci-prov-learned">learned</span>
    ) : seed === "gc_edit" ? (
      <span className="gci-prov gci-prov-edited">edited</span>
    ) : (
      <span className="gci-prov gci-prov-market">market</span>
    );

  return (
    <div>
      {error && (
        <div className="gci-errors" role="alert">
          <p>{error}</p>
        </div>
      )}
      <table className="gci-lines">
        <thead>
          <tr>
            <th>Item</th>
            <th>Qty</th>
            <th>Unit</th>
            <th className="num">Unit $</th>
            <th className="num">Total</th>
          </tr>
        </thead>
        <tbody>
          {estimate.lines.map((l) => {
            const d = draft[l.lineage_id];
            const total = round2(Number(d.quantity) * Number(d.unit_cost));
            const edited = d.quantity !== l.quantity || d.unit_cost !== l.unit_cost;
            return (
              <tr key={l.lineage_id} className={edited ? "gci-edited-row" : ""}>
                <td>
                  <div>{l.description}</div>
                  <div className="gci-linemeta">
                    {l.cost_code} {badge(edited ? "gc_edit" : l.seed_source)}
                  </div>
                </td>
                <td>
                  <input
                    inputMode="decimal"
                    value={d.quantity}
                    onChange={(e) => set(l.lineage_id, "quantity", e.target.value)}
                    aria-label={`quantity for ${l.description}`}
                  />
                </td>
                <td>{l.uom}</td>
                <td className="num">
                  <input
                    inputMode="decimal"
                    value={d.unit_cost}
                    onChange={(e) => set(l.lineage_id, "unit_cost", e.target.value)}
                    aria-label={`unit cost for ${l.description}`}
                  />
                </td>
                <td className="num">{money(total)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>

      <div className="gci-markups">
        {estimate.markups.map((m) => (
          <div key={m.name}>
            <span>{m.name}{m.rate_pct ? ` (${Number(m.rate_pct)}%)` : ""}</span>
          </div>
        ))}
      </div>

      <div className="gci-editbar">
        <div>
          <div className="gci-range">{money(preview.low)} – {money(preview.high)}</div>
          <div className="gci-hint">Total {money(preview.grand)} · seeded from county data, your edit is the price</div>
        </div>
        <button className="gci-primary" disabled={busy || changed.length === 0} onClick={save}>
          {busy ? "Saving…" : changed.length === 0 ? "No changes" : `Save my prices (${changed.length})`}
        </button>
      </div>
    </div>
  );
}
