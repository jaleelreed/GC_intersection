"use client";
// US-025/US-026 buyer controls. Accept and Decline are both terminal and
// confirm once. No payment is collected (D6) — this records agreement, or a
// polite no, only.
import { useState } from "react";

export function AcceptBid({ token, initialStatus }: { token: string; initialStatus: string }) {
  const [status, setStatus] = useState(initialStatus);
  const [busy, setBusy] = useState(false);
  const [mode, setMode] = useState<"idle" | "confirm-accept" | "decline" | "question">("idle");
  const [reason, setReason] = useState("");
  const [question, setQuestion] = useState("");
  const [questionSent, setQuestionSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (status === "accepted") {
    return <p className="text-positive font-bold">✓ You accepted this bid. The contractor has been notified.</p>;
  }
  if (status === "declined") {
    return <p className="text-danger font-bold">This bid was declined. The contractor has been notified.</p>;
  }

  async function call(path: string, extra: Record<string, unknown>, nextStatus: string) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(path, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ token, ...extra }),
      });
      const data = await res.json();
      if (!res.ok) setError(data.error ?? "Something went wrong.");
      else setStatus(nextStatus);
    } catch {
      setError("Network problem — try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      {error && (
        <div className="mb-4 rounded-lg border border-danger bg-surface p-3 text-danger" role="alert"><p>{error}</p></div>
      )}

      {mode === "confirm-accept" ? (
        <div className="flex flex-wrap items-center gap-3">
          <button type="button" className="ui-btn ui-btn-ghost" onClick={() => setMode("idle")}>Cancel</button>
          <button type="button" className="ui-btn ui-btn-primary" disabled={busy} onClick={() => call("/api/proposal/accept", {}, "accepted")}>
            {busy ? "…" : "Yes, accept this bid"}
          </button>
        </div>
      ) : mode === "decline" ? (
        <div>
          <textarea
            rows={2}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Optional: let them know why"
            aria-label="Decline reason"
            className="ui-input"
          />
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <button type="button" className="ui-btn ui-btn-ghost" onClick={() => setMode("idle")}>Cancel</button>
            <button type="button" className="ui-btn border-danger text-danger" disabled={busy} onClick={() => call("/api/proposal/decline", { reason }, "declined")}>
              {busy ? "…" : "Decline this bid"}
            </button>
          </div>
        </div>
      ) : mode === "question" ? (
        questionSent ? (
          <p className="text-sm text-muted">Sent — the contractor will get back to you.</p>
        ) : (
          <div>
            <textarea
              rows={2}
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              placeholder="Ask the contractor a question about this estimate"
              aria-label="Your question"
              className="ui-input"
            />
            <div className="mt-3 flex flex-wrap items-center gap-3">
              <button type="button" className="ui-btn ui-btn-ghost" onClick={() => setMode("idle")}>Cancel</button>
              <button
                type="button"
                className="ui-btn ui-btn-primary"
                disabled={busy || !question.trim()}
                onClick={async () => {
                  setBusy(true);
                  setError(null);
                  try {
                    const res = await fetch("/api/proposal/question", {
                      method: "POST",
                      headers: { "content-type": "application/json" },
                      body: JSON.stringify({ token, question }),
                    });
                    if (res.ok) setQuestionSent(true);
                    else setError("Could not send — try again.");
                  } catch {
                    setError("Network problem — try again.");
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                {busy ? "…" : "Send question"}
              </button>
            </div>
          </div>
        )
      ) : (
        <div className="flex flex-wrap items-center gap-3">
          <button type="button" className="ui-btn ui-btn-primary" onClick={() => setMode("confirm-accept")}>
            Accept this bid
          </button>
          <button type="button" className="ui-btn ui-btn-quiet" onClick={() => setMode("question")}>
            Ask a question
          </button>
          <button type="button" className="ui-btn ui-btn-quiet" onClick={() => setMode("decline")}>
            Decline
          </button>
        </div>
      )}
      <p className="mt-4 text-sm text-muted">Accepting records your agreement to the scope and price. No payment is collected here.</p>
    </div>
  );
}
