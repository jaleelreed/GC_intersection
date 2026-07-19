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
    <section className="gci-history">
      <h2>Version history</h2>
      <ul className="gci-vlist">
        {versions.map((v) => (
          <li key={v.id}>
            <span>
              v{v.version_no} {v.label ? `· ${v.label}` : ""} · {money(v.grand_total)}
              {v.is_current ? " · current" : ""}
              {v.locked ? " · accepted" : ""}
            </span>
            {!v.is_current && !v.locked && (
              <button type="button" className="gci-linkbtn" disabled={busy} onClick={() => revert(v.id)}>
                Restore
              </button>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
