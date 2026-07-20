"use client";
// Version history with non-destructive revert (copies a prior version forward).
import { useState } from "react";
import { useRouter } from "next/navigation";

interface Version {
  id: string;
  version_no: number;
  label: string | null;
  grand_total: string;
  is_current: boolean;
  locked: boolean;
}

const money = (v: string) => `$${Math.round(Number(v)).toLocaleString("en-US")}`;

export function VersionHistory({ versions }: { versions: Version[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  if (versions.length <= 1) return null;

  async function revert(id: string) {
    setBusy(true);
    try {
      const res = await fetch(`/api/estimate/${id}/revert`, { method: "POST" });
      if (res.ok) router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="mt-10">
      <h2 className="text-lg font-bold text-ink">Version history</h2>
      <ul className="mt-4 divide-y divide-line overflow-hidden rounded-xl border border-line bg-surface">
        {versions.map((v) => (
          <li key={v.id} className="flex items-center justify-between gap-3 px-4 py-3 text-sm">
            <span className="text-ink">
              v{v.version_no} {v.label ? `· ${v.label}` : ""} · <span className="tabular-nums">{money(v.grand_total)}</span>
              {v.is_current ? " · current" : ""}
              {v.locked ? " · accepted" : ""}
            </span>
            {!v.is_current && !v.locked && (
              <button type="button" className="ui-btn ui-btn-quiet text-sm" disabled={busy} onClick={() => revert(v.id)}>
                Restore
              </button>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
