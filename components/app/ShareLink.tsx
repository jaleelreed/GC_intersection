"use client";
// The GC's actual, usable intake link: full URL, one-tap copy, open-the-form,
// and a QR for the warm channel (D12). The whole point of X-1 — they can take
// a lead on day one — collapses if this is just inline text.
import { useEffect, useState } from "react";
import QRCode from "qrcode";

export function ShareLink({ slug, compact = false }: { slug: string; compact?: boolean }) {
  const [url, setUrl] = useState("");
  const [qr, setQr] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const full = `${window.location.origin}/i/${slug}`;
    setUrl(full);
    QRCode.toDataURL(full, { width: 320, margin: 1 })
      .then(setQr)
      .catch(() => setQr(null));
  }, [slug]);

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* clipboard blocked — the field is selectable as a fallback */
    }
  }

  return (
    <section className={`gci-share ${compact ? "gci-share-compact" : ""}`}>
      <h2>Your estimate link</h2>
      <p className="gci-hint">Share it with homeowners. Every submission comes back priced.</p>

      <div className="gci-copyrow">
        <input readOnly value={url} onFocus={(e) => e.currentTarget.select()} aria-label="Your intake link" />
        <button type="button" className="gci-primary" onClick={copy}>
          {copied ? "Copied ✓" : "Copy"}
        </button>
      </div>

      <div className="gci-share-actions">
        <a className="gci-btn" href={url} target="_blank" rel="noreferrer">
          Open the form ↗
        </a>
      </div>

      {!compact && qr && (
        <div className="gci-qr">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={qr} alt="QR code for your intake link" width={160} height={160} />
          <span className="gci-hint">Point a phone camera here to open the form.</span>
        </div>
      )}
    </section>
  );
}
