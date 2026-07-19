"use client";
// Gap 8: invite by email, remove members. The invitee signs in with that
// email and lands in this workspace (no email send required).
import { useState } from "react";
import { useRouter } from "next/navigation";

interface Member {
  membership_id: string;
  email: string;
  full_name: string | null;
  role: string;
  is_self: boolean;
}

export function TeamManager({ members }: { members: Member[] }) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function invite(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch("/api/team", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "add", email }),
      });
      const data = await res.json();
      if (!res.ok) setMsg(data.error ?? "Could not invite.");
      else {
        setMsg(data.result === "existing" ? "Already on the team." : `Invited ${email}. They sign in with this email.`);
        setEmail("");
        router.refresh();
      }
    } finally {
      setBusy(false);
    }
  }

  async function remove(membershipId: string) {
    await fetch("/api/team", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "remove", membershipId }),
    });
    router.refresh();
  }

  return (
    <div>
      <form className="gci-share" onSubmit={invite}>
        <h2>Invite a teammate</h2>
        <p className="gci-hint">They sign in with this email — no separate invite to accept.</p>
        <div className="gci-copyrow">
          <input type="email" placeholder="name@company.com" value={email} onChange={(e) => setEmail(e.target.value)} />
          <button type="submit" className="gci-primary" disabled={busy}>{busy ? "…" : "Invite"}</button>
        </div>
        {msg && <p className="gci-hint">{msg}</p>}
      </form>

      <ul className="gci-leads">
        {members.map((m) => (
          <li key={m.membership_id}>
            <div className="gci-lead-row">
              <strong>{m.full_name || m.email}</strong>
              <span className="gci-hint">{m.role.replace("_", " ")}{m.is_self ? " · you" : ""}</span>
            </div>
            {!m.is_self && (
              <button type="button" className="gci-linkbtn" onClick={() => remove(m.membership_id)}>Remove</button>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
