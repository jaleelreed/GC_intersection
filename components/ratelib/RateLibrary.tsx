"use client";
// Manage learned rates: edit the unit price the engine uses, or revert one to
// the market seed. The flywheel proposes; here the operator confirms (§17).
import { useState } from "react";
import { useRouter } from "next/navigation";

interface Rate {
  id: string;
  name: string;
  cost_code: string | null;
  uom: string;
  unit_cost: string;
}

export function RateLibrary({ rates }: { rates: Rate[] }) {
  const router = useRouter();
  const [edits, setEdits] = useState<Record<string, string>>(
    Object.fromEntries(rates.map((r) => [r.id, Number(r.unit_cost).toFixed(2)]))
  );
  const [busy, setBusy] = useState(false);

  async function post(body: unknown) {
    setBusy(true);
    try {
      const res = await fetch("/api/pricing", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      if (res.ok) router.refresh();
    } finally {
      setBusy(false);
    }
  }

  if (rates.length === 0) {
    return (
      <p className="gci-hint">
        No learned rates yet. Edit a draft&rsquo;s prices and your numbers appear here — the
        engine uses them on future drafts, and you can adjust or revert them any time.
      </p>
    );
  }

  return (
    <table className="gci-bidlines">
      <thead>
        <tr><th>Item</th><th>Code</th><th className="num">Your unit ($/{"{uom}"})</th><th></th></tr>
      </thead>
      <tbody>
        {rates.map((r) => (
          <tr key={r.id}>
            <td>{r.name}</td>
            <td>{r.cost_code ?? "—"}</td>
            <td className="num">
              <input
                inputMode="decimal"
                value={edits[r.id] ?? ""}
                onChange={(e) => setEdits((s) => ({ ...s, [r.id]: e.target.value.replace(/[^0-9.]/g, "") }))}
                aria-label={`unit price for ${r.name}`}
                style={{ width: 90, textAlign: "right" }}
              />
              <span className="gci-hint"> /{r.uom}</span>
            </td>
            <td>
              <button type="button" className="gci-linkbtn" disabled={busy}
                onClick={() => post({ action: "update", id: r.id, unit_cost: edits[r.id] })}>
                Save
              </button>
              <button type="button" className="gci-linkbtn" disabled={busy}
                onClick={() => post({ action: "delete", id: r.id })}>
                Revert
              </button>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
