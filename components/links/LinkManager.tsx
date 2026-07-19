"use client";
// Gap 4: create + view intake links, each with its share URL, QR, and (for
// embed) the one-line script tag. Channel attribution made visible.
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import QRCode from "qrcode";
import { CHANNELS, CHANNEL_LABEL, type Channel } from "../../lib/links/types";

interface LinkRow {
  id: string;
  slug: string;
  channel: Channel;
  label: string | null;
  is_active: boolean;
  lead_count: number;
}

function LinkCard({ link, origin }: { link: LinkRow; origin: string }) {
  const url = `${origin}/i/${link.slug}`;
  const [qr, setQr] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  useEffect(() => {
    if (link.channel === "qr") QRCode.toDataURL(url, { width: 240, margin: 1 }).then(setQr).catch(() => {});
  }, [url, link.channel]);

  const embedSnippet = `<script src="${origin}/embed.js" data-slug="${link.slug}"></script>`;
  function copy(text: string, which: string) {
    navigator.clipboard?.writeText(text);
    setCopied(which);
    setTimeout(() => setCopied(null), 2000);
  }

  return (
    <div className="gci-linkcard">
      <div className="gci-linkcard-head">
        <strong>{link.label || "Link"}</strong>
        <span className="gci-pill gci-stage-new">{CHANNEL_LABEL[link.channel]}</span>
        <span className="gci-hint">{link.lead_count} leads</span>
      </div>
      <div className="gci-copyrow">
        <input readOnly value={url} onFocus={(e) => e.currentTarget.select()} />
        <button type="button" className="gci-primary" onClick={() => copy(url, "url")}>
          {copied === "url" ? "Copied ✓" : "Copy"}
        </button>
      </div>
      {link.channel === "embed" && (
        <div className="gci-copyrow" style={{ marginTop: 8 }}>
          <input readOnly value={embedSnippet} onFocus={(e) => e.currentTarget.select()} />
          <button type="button" className="gci-btn" onClick={() => copy(embedSnippet, "embed")}>
            {copied === "embed" ? "Copied ✓" : "Copy snippet"}
          </button>
        </div>
      )}
      {link.channel === "qr" && qr && (
        <div className="gci-qr">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={qr} alt={`QR for ${link.label}`} width={140} height={140} />
        </div>
      )}
    </div>
  );
}

export function LinkManager({ links }: { links: LinkRow[] }) {
  const router = useRouter();
  const [origin, setOrigin] = useState("");
  const [label, setLabel] = useState("");
  const [channel, setChannel] = useState<Channel>("link");
  const [busy, setBusy] = useState(false);

  useEffect(() => setOrigin(window.location.origin), []);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const res = await fetch("/api/links", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ label, channel }),
      });
      if (res.ok) {
        setLabel("");
        router.refresh();
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <form className="gci-share" onSubmit={create}>
        <h2>New link</h2>
        <div className="gci-newlink">
          <input placeholder="Label (e.g. Spring yard signs)" value={label} onChange={(e) => setLabel(e.target.value)} />
          <select value={channel} onChange={(e) => setChannel(e.target.value as Channel)} aria-label="channel">
            {CHANNELS.map((c) => <option key={c} value={c}>{CHANNEL_LABEL[c]}</option>)}
          </select>
          <button type="submit" className="gci-primary" disabled={busy}>{busy ? "…" : "Create"}</button>
        </div>
      </form>

      {links.map((l) => (
        <LinkCard key={l.id} link={l} origin={origin} />
      ))}
    </div>
  );
}
