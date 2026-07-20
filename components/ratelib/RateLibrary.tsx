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
      <p className="mt-6 text-muted">
        No learned rates yet. Edit a draft&rsquo;s prices and your numbers appear here — the
        engine uses them on future drafts, and you can adjust or revert them any time.
      </p>
    );
  }

  return (
    <div className="ui-card mt-6 overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-line text-left text-muted">
            <th className="px-4 py-3 font-semibold">Item</th>
            <th className="px-4 py-3 font-semibold">Code</th>
            <th className="px-4 py-3 text-right font-semibold">Your unit ($/{"{uom}"})</th>
            <th className="px-4 py-3"></th>
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {rates.map((r) => (
            <tr key={r.id}>
              <td className="px-4 py-3 text-ink">{r.name}</td>
              <td className="px-4 py-3 text-muted">{r.cost_code ?? "—"}</td>
              <td className="px-4 py-3 text-right">
                <input
                  className="ui-input inline-block w-24 text-right tabular-nums"
                  inputMode="decimal"
                  value={edits[r.id] ?? ""}
                  onChange={(e) => setEdits((s) => ({ ...s, [r.id]: e.target.value.replace(/[^0-9.]/g, "") }))}
                  aria-label={`unit price for ${r.name}`}
                />
                <span className="text-muted"> /{r.uom}</span>
              </td>
              <td className="px-4 py-3 text-right whitespace-nowrap">
                <button type="button" className="ui-btn ui-btn-quiet text-accent" disabled={busy}
                  onClick={() => post({ action: "update", id: r.id, unit_cost: edits[r.id] })}>
                  Save
                </button>
                <button type="button" className="ui-btn ui-btn-quiet" disabled={busy}
                  onClick={() => post({ action: "delete", id: r.id })}>
                  Revert
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
