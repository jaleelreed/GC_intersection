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
    <section className={`ui-card ${compact ? "p-5" : "p-6"}`}>
      <h2 className="font-display text-lg font-bold">Your estimate link</h2>
      <p className="mt-1 text-sm text-muted">Share it with homeowners. Every submission comes back priced.</p>

      <div className="mt-4 flex flex-col gap-2 sm:flex-row">
        <input
          className="ui-input"
          readOnly
          value={url}
          onFocus={(e) => e.currentTarget.select()}
          aria-label="Your intake link"
        />
        <button type="button" className="ui-btn ui-btn-primary shrink-0" onClick={copy}>
          {copied ? "Copied ✓" : "Copy"}
        </button>
      </div>

      <div className="mt-3">
        <a className="ui-btn ui-btn-ghost text-sm" href={url} target="_blank" rel="noreferrer">
          Open the form ↗
        </a>
      </div>

      {!compact && qr && (
        <div className="mt-5 flex flex-col items-center gap-2 rounded-xl border border-line bg-raised p-4 text-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={qr} alt="QR code for your intake link" width={160} height={160} />
          <span className="text-sm text-muted">Point a phone camera here to open the form.</span>
        </div>
      )}
    </section>
  );
}
