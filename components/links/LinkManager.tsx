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
    <div className="ui-card mt-4 p-5">
      <div className="flex flex-wrap items-center gap-3">
        <strong className="font-display text-base">{link.label || "Link"}</strong>
        <span className="ui-chip">{CHANNEL_LABEL[link.channel]}</span>
        <span className="text-sm text-faint">{link.lead_count} leads</span>
      </div>
      <div className="mt-3 flex gap-2">
        <input className="ui-input" readOnly value={url} onFocus={(e) => e.currentTarget.select()} />
        <button type="button" className="ui-btn ui-btn-primary shrink-0" onClick={() => copy(url, "url")}>
          {copied === "url" ? "Copied ✓" : "Copy"}
        </button>
      </div>
      {link.channel === "embed" && (
        <div className="mt-2 flex gap-2">
          <input className="ui-input" readOnly value={embedSnippet} onFocus={(e) => e.currentTarget.select()} />
          <button type="button" className="ui-btn ui-btn-ghost shrink-0" onClick={() => copy(embedSnippet, "embed")}>
            {copied === "embed" ? "Copied ✓" : "Copy snippet"}
          </button>
        </div>
      )}
      {link.channel === "qr" && qr && (
        <div className="mt-3">
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
      <form className="ui-card mt-6 p-5" onSubmit={create}>
        <h2 className="font-display text-lg font-semibold">New link</h2>
        <div className="mt-3 flex flex-col gap-2 sm:flex-row">
          <input className="ui-input" placeholder="Label (e.g. Spring yard signs)" value={label} onChange={(e) => setLabel(e.target.value)} />
          <select className="ui-input sm:w-auto" value={channel} onChange={(e) => setChannel(e.target.value as Channel)} aria-label="channel">
            {CHANNELS.map((c) => <option key={c} value={c}>{CHANNEL_LABEL[c]}</option>)}
          </select>
          <button type="submit" className="ui-btn ui-btn-primary shrink-0" disabled={busy}>{busy ? "…" : "Create"}</button>
        </div>
      </form>

      {links.map((l) => (
        <LinkCard key={l.id} link={l} origin={origin} />
      ))}
    </div>
  );
}
