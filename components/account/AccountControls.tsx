"use client";
// Data export + workspace deletion (privacy controls). Owner-only surface.
import { useState } from "react";
import { useRouter } from "next/navigation";

export function AccountControls({ orgName }: { orgName: string }) {
  const router = useRouter();
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function exportData() {
    setBusy(true);
    try {
      const res = await fetch("/api/account", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "export" }),
      });
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "gc-intersection-export.json";
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      setBusy(false);
    }
  }

  async function deleteWs() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/account", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "delete", confirm }),
      });
      if (!res.ok) {
        const d = await res.json();
        setError(d.error ?? "Could not delete.");
      } else {
        router.push("/auth/sign-in");
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="mt-6 space-y-6">
      <div className="ui-card p-6">
        <h2 className="font-display text-lg font-bold text-ink">Your data</h2>
        <button type="button" className="ui-btn ui-btn-ghost mt-4" onClick={exportData} disabled={busy}>
          Export workspace data (JSON)
        </button>
      </div>

      <div className="ui-card border-danger p-6">
        <h3 className="font-display text-lg font-bold text-danger">Delete workspace</h3>
        <p className="mt-1 text-sm text-muted">
          Permanently removes this workspace and all its projects, estimates, and learned
          pricing. This cannot be undone. Type <strong className="text-ink">{orgName}</strong> to confirm.
        </p>
        {error && <div className="mt-3 rounded-xl border border-danger bg-surface p-3 text-danger" role="alert"><p>{error}</p></div>}
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <input className="ui-input flex-1" value={confirm} onChange={(e) => setConfirm(e.target.value)} placeholder={orgName} />
          <button
            type="button"
            className="ui-btn bg-danger text-white"
            disabled={busy || confirm !== orgName}
            onClick={deleteWs}
          >
            Delete forever
          </button>
        </div>
      </div>
    </section>
  );
}
