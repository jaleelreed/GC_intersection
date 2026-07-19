"use client";
// US-025 buyer control. Accept is irreversible for the buyer, so it confirms
// once. No payment is collected (D6) — this records agreement only.
import { useState } from "react";

export function AcceptBid({ token, initialStatus }: { token: string; initialStatus: string }) {
  const [status, setStatus] = useState(initialStatus);
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (status === "accepted") {
    return <p className="gci-accepted">✓ You accepted this bid. The contractor has been notified.</p>;
  }

  async function accept() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/proposal/accept", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ token }),
      });
      const data = await res.json();
      if (!res.ok) setError(data.error ?? "Could not accept.");
      else setStatus("accepted");
    } catch {
      setError("Network problem — try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      {error && (
        <div className="gci-errors" role="alert">
          <p>{error}</p>
        </div>
      )}
      {confirming ? (
        <div className="gci-nav">
          <button type="button" onClick={() => setConfirming(false)}>
            Cancel
          </button>
          <button type="button" className="gci-primary" disabled={busy} onClick={accept}>
            {busy ? "…" : "Yes, accept this bid"}
          </button>
        </div>
      ) : (
        <button type="button" className="gci-primary" onClick={() => setConfirming(true)}>
          Accept this bid
        </button>
      )}
      <p className="gci-hint">Accepting records your agreement to the scope and price. No payment is collected here.</p>
    </div>
  );
}
