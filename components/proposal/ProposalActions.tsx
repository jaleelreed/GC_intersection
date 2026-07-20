"use client";
// Gap 7: GC-side proposal actions — resend (new link) or withdraw a live bid.
import { useState } from "react";
import { useRouter } from "next/navigation";

export function ProposalActions({ proposalId, status }: { proposalId: string; status: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [link, setLink] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const live = status === "sent" || status === "viewed";
  if (!live) return null;

  async function act(action: "resend" | "withdraw") {
    setBusy(true);
    try {
      const res = await fetch(`/api/proposals/${proposalId}/action`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const data = await res.json();
      if (res.ok && action === "resend") setLink(data.buyerUrl);
      else if (res.ok) router.refresh();
    } finally {
      setBusy(false);
    }
  }

  if (link) {
    return (
      <div className="flex flex-wrap items-center gap-2">
        <input className="ui-input flex-1" readOnly value={link} onFocus={(e) => e.currentTarget.select()} />
        <button type="button" className="ui-btn ui-btn-ghost" onClick={() => { navigator.clipboard?.writeText(link); setCopied(true); }}>
          {copied ? "Copied ✓" : "Copy new link"}
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <button type="button" className="ui-btn ui-btn-ghost" disabled={busy} onClick={() => act("resend")}>Resend</button>
      <button type="button" className="ui-btn ui-btn-quiet" disabled={busy} onClick={() => act("withdraw")}>Withdraw</button>
    </div>
  );
}
