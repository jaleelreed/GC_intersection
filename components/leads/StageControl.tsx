"use client";
// Per-lead stage control (new → contacted → quoted → won/lost).
import { useState } from "react";
import { useRouter } from "next/navigation";
import { LEAD_STAGES, type LeadStage } from "../../lib/leads/repo";

const LABEL: Record<LeadStage, string> = {
  new: "New",
  contacted: "Contacted",
  quoted: "Quoted",
  won: "Won",
  lost: "Lost",
};

export function StageControl({ leadId, stage }: { leadId: string; stage: LeadStage }) {
  const router = useRouter();
  const [current, setCurrent] = useState<LeadStage>(stage);
  const [busy, setBusy] = useState(false);

  async function change(next: LeadStage) {
    if (next === current) return;
    setBusy(true);
    const prev = current;
    setCurrent(next);
    try {
      const res = await fetch(`/api/lead/${leadId}/stage`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ stage: next }),
      });
      if (!res.ok) setCurrent(prev);
      else router.refresh();
    } catch {
      setCurrent(prev);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="gci-stages" role="group" aria-label="Lead stage">
      {LEAD_STAGES.map((s) => (
        <button
          key={s}
          type="button"
          disabled={busy}
          aria-pressed={current === s}
          className={`gci-stage-btn ${current === s ? "sel" : ""} gci-stage-${s}`}
          onClick={() => change(s)}
        >
          {LABEL[s]}
        </button>
      ))}
    </div>
  );
}
