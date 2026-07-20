"use client";
// US-017: the GC sends the bid and gets a shareable buyer link. No email is
// sent from the platform yet (EP-01 non-goal) — the GC copies the link.
import { useState } from "react";

export function SendBid({
  versionId,
  defaultName,
  defaultEmail,
}: {
  versionId: string;
  defaultName: string;
  defaultEmail: string;
}) {
  const [name, setName] = useState(defaultName);
  const [email, setEmail] = useState(defaultEmail);
  const [coverNote, setCoverNote] = useState("");
  const [inclusions, setInclusions] = useState("");
  const [exclusions, setExclusions] = useState("");
  const [terms, setTerms] = useState("");
  const [expiresDays, setExpiresDays] = useState("30");
  const [showMore, setShowMore] = useState(false);
  const [busy, setBusy] = useState(false);
  const [url, setUrl] = useState<string | null>(null);
  const [delivery, setDelivery] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  async function send(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/estimate/${versionId}/send`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          recipientName: name,
          recipientEmail: email,
          coverNote,
          inclusions,
          exclusions,
          terms,
          expiresDays: Number(expiresDays) || 30,
        }),
      });
      const data = await res.json();
      if (!res.ok) setError(data.error ?? "Could not send.");
      else {
        setUrl(data.buyerUrl);
        setDelivery(data.delivery ?? "queued");
      }
    } catch {
      setError("Network problem — try again.");
    } finally {
      setBusy(false);
    }
  }

  if (url) {
    return (
      <section className="ui-card mt-6 p-6">
        <h2 className="text-lg font-bold text-ink">Bid ready to share</h2>
        <p className="mt-1 text-sm text-muted">
          {delivery === "sent"
            ? `Emailed to ${email}. You can also copy the link below.`
            : `Copy this link and send it to ${email}. They can view and accept it.`}
        </p>
        <div className="mt-4 flex flex-col gap-2 sm:flex-row">
          <input
            data-testid="bid-link"
            readOnly
            value={url}
            onFocus={(e) => e.currentTarget.select()}
            className="ui-input flex-1 tabular-nums"
          />
          <button
            type="button"
            className="ui-btn ui-btn-primary"
            onClick={() => {
              navigator.clipboard?.writeText(url);
              setCopied(true);
            }}
          >
            {copied ? "Copied" : "Copy link"}
          </button>
        </div>
      </section>
    );
  }

  return (
    <form className="ui-card mt-6 p-6" onSubmit={send}>
      <h2 className="text-lg font-bold text-ink">Send the bid</h2>
      {error && (
        <div className="mt-3 rounded-xl border border-danger bg-accent-soft p-4 text-sm text-ink" role="alert">
          <p>{error}</p>
        </div>
      )}
      <div className="mt-4 space-y-4">
        <label className="block">
          <span className="ui-label">Recipient name</span>
          <input value={name} onChange={(e) => setName(e.target.value)} className="ui-input" />
        </label>
        <label className="block">
          <span className="ui-label">Recipient email</span>
          <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} className="ui-input" />
        </label>
      </div>

      <button type="button" className="ui-btn ui-btn-quiet mt-3" onClick={() => setShowMore(!showMore)}>
        {showMore ? "Hide bid details" : "Add cover note, inclusions, terms…"}
      </button>

      {showMore && (
        <div className="mt-3 space-y-4 rounded-xl border border-line bg-bg p-4">
          <label className="block">
            <span className="ui-label">Cover note</span>
            <textarea rows={2} value={coverNote} onChange={(e) => setCoverNote(e.target.value)} placeholder="A short message to the homeowner" className="ui-input" />
          </label>
          <label className="block">
            <span className="ui-label">Included</span>
            <textarea rows={2} value={inclusions} onChange={(e) => setInclusions(e.target.value)} placeholder="What this price covers" className="ui-input" />
          </label>
          <label className="block">
            <span className="ui-label">Excluded</span>
            <textarea rows={2} value={exclusions} onChange={(e) => setExclusions(e.target.value)} placeholder="What it does not cover (permits, allowances, etc.)" className="ui-input" />
          </label>
          <label className="block">
            <span className="ui-label">Terms</span>
            <textarea rows={2} value={terms} onChange={(e) => setTerms(e.target.value)} placeholder="Payment terms, warranty, conditions" className="ui-input" />
          </label>
          <label className="block">
            <span className="ui-label">Expires in (days)</span>
            <input type="number" min={1} max={365} value={expiresDays} onChange={(e) => setExpiresDays(e.target.value)} className="ui-input" />
          </label>
        </div>
      )}

      <button type="submit" className="ui-btn ui-btn-primary mt-4" disabled={busy}>
        {busy ? "Preparing…" : "Create bid link"}
      </button>
    </form>
  );
}
