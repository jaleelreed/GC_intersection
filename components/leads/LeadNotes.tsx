"use client";
// Per-lead notes: append-only, newest first.
import { useState } from "react";
import type { LeadNote } from "../../lib/leads/repo";

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
    <section className="gci-notes">
      <h2>Notes</h2>
      <form onSubmit={add} className="gci-note-form">
        <textarea
          rows={2}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Add a note — a call, a follow-up, a detail…"
        />
        <button type="submit" className="gci-primary" disabled={busy || !text.trim()}>
          {busy ? "…" : "Add"}
        </button>
      </form>
      <ul className="gci-note-list">
        {notes.map((n) => (
          <li key={n.id}>
            <div>{n.body}</div>
            <div className="gci-hint">{new Date(n.created_at).toLocaleString()}</div>
          </li>
        ))}
        {notes.length === 0 && <li className="gci-hint">No notes yet.</li>}
      </ul>
    </section>
  );
}
