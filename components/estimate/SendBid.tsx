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
      <section className="gci-sendbox">
        <h2>Bid ready to share</h2>
        <p className="gci-hint">
          {delivery === "sent"
            ? `Emailed to ${email}. You can also copy the link below.`
            : `Copy this link and send it to ${email}. They can view and accept it.`}
        </p>
        <div className="gci-copyrow">
          <input readOnly value={url} onFocus={(e) => e.currentTarget.select()} />
          <button
            type="button"
            className="gci-primary"
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
    <form className="gci-sendbox" onSubmit={send}>
      <h2>Send the bid</h2>
      {error && (
        <div className="gci-errors" role="alert">
          <p>{error}</p>
        </div>
      )}
      <label>
        Recipient name
        <input value={name} onChange={(e) => setName(e.target.value)} />
      </label>
      <label>
        Recipient email
        <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
      </label>

      <button type="button" className="gci-linkbtn" onClick={() => setShowMore(!showMore)}>
        {showMore ? "Hide bid details" : "Add cover note, inclusions, terms…"}
      </button>

      {showMore && (
        <div className="gci-bid-extra">
          <label>
            Cover note
            <textarea rows={2} value={coverNote} onChange={(e) => setCoverNote(e.target.value)} placeholder="A short message to the homeowner" />
          </label>
          <label>
            Included
            <textarea rows={2} value={inclusions} onChange={(e) => setInclusions(e.target.value)} placeholder="What this price covers" />
          </label>
          <label>
            Excluded
            <textarea rows={2} value={exclusions} onChange={(e) => setExclusions(e.target.value)} placeholder="What it does not cover (permits, allowances, etc.)" />
          </label>
          <label>
            Terms
            <textarea rows={2} value={terms} onChange={(e) => setTerms(e.target.value)} placeholder="Payment terms, warranty, conditions" />
          </label>
          <label>
            Expires in (days)
            <input type="number" min={1} max={365} value={expiresDays} onChange={(e) => setExpiresDays(e.target.value)} />
          </label>
        </div>
      )}

      <button type="submit" className="gci-primary" disabled={busy}>
        {busy ? "Preparing…" : "Create bid link"}
      </button>
    </form>
  );
}
