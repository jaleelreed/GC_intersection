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
    <section className="gci-share">
      <h2>Your data</h2>
      <button type="button" className="gci-btn" onClick={exportData} disabled={busy}>
        Export workspace data (JSON)
      </button>

      <div className="gci-danger">
        <h3>Delete workspace</h3>
        <p className="gci-hint">
          Permanently removes this workspace and all its projects, estimates, and learned
          pricing. This cannot be undone. Type <strong>{orgName}</strong> to confirm.
        </p>
        {error && <div className="gci-errors" role="alert"><p>{error}</p></div>}
        <div className="gci-copyrow">
          <input value={confirm} onChange={(e) => setConfirm(e.target.value)} placeholder={orgName} />
          <button
            type="button"
            className="gci-declinebtn"
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
