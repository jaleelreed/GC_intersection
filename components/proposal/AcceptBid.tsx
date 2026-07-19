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
    return <p className="gci-accepted">✓ You accepted this bid. The contractor has been notified.</p>;
  }
  if (status === "declined") {
    return <p className="gci-declined">This bid was declined. The contractor has been notified.</p>;
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
        <div className="gci-errors" role="alert"><p>{error}</p></div>
      )}

      {mode === "confirm-accept" ? (
        <div className="gci-nav">
          <button type="button" onClick={() => setMode("idle")}>Cancel</button>
          <button type="button" className="gci-primary" disabled={busy} onClick={() => call("/api/proposal/accept", {}, "accepted")}>
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
            className="gci-wideinput"
          />
          <div className="gci-nav">
            <button type="button" onClick={() => setMode("idle")}>Cancel</button>
            <button type="button" className="gci-declinebtn" disabled={busy} onClick={() => call("/api/proposal/decline", { reason }, "declined")}>
              {busy ? "…" : "Decline this bid"}
            </button>
          </div>
        </div>
      ) : mode === "question" ? (
        questionSent ? (
          <p className="gci-hint">Sent — the contractor will get back to you.</p>
        ) : (
          <div>
            <textarea
              rows={2}
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              placeholder="Ask the contractor a question about this estimate"
              aria-label="Your question"
              className="gci-wideinput"
            />
            <div className="gci-nav">
              <button type="button" onClick={() => setMode("idle")}>Cancel</button>
              <button
                type="button"
                className="gci-primary"
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
        <div className="gci-buyer-actions">
          <button type="button" className="gci-primary" onClick={() => setMode("confirm-accept")}>
            Accept this bid
          </button>
          <button type="button" className="gci-linkbtn" onClick={() => setMode("question")}>
            Ask a question
          </button>
          <button type="button" className="gci-linkbtn" onClick={() => setMode("decline")}>
            Decline
          </button>
        </div>
      )}
      <p className="gci-hint">Accepting records your agreement to the scope and price. No payment is collected here.</p>
    </div>
  );
}
