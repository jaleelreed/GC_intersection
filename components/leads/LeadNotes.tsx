"use client";
// Per-lead notes: append-only, newest first.
import { useState } from "react";
import type { LeadNote } from "../../lib/leads/types";

export function LeadNotes({ leadId, initial }: { leadId: string; initial: LeadNote[] }) {
  const [notes, setNotes] = useState<LeadNote[]>(initial);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    const body = text.trim();
    if (!body) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/lead/${leadId}/note`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ body }),
      });
      const data = await res.json();
      if (res.ok) {
        setNotes([data.note, ...notes]);
        setText("");
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="ui-card p-6">
      <h2 className="font-display text-lg font-bold">Notes</h2>
      <form onSubmit={add} className="mt-4 flex flex-col gap-2">
        <textarea
          className="ui-input"
          rows={2}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Add a note — a call, a follow-up, a detail…"
        />
        <button type="submit" className="ui-btn ui-btn-primary self-end" disabled={busy || !text.trim()}>
          {busy ? "…" : "Add"}
        </button>
      </form>
      <ul className="mt-4 divide-y divide-line">
        {notes.map((n) => (
          <li key={n.id} className="py-3">
            <div className="text-ink">{n.body}</div>
            <div className="mt-1 text-sm text-muted">{new Date(n.created_at).toLocaleString()}</div>
          </li>
        ))}
        {notes.length === 0 && <li className="py-3 text-sm text-muted">No notes yet.</li>}
      </ul>
    </section>
  );
}
