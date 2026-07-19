// The reveal (E design §3): the range huge, drivers named, hints quarantined.
import { notFound } from "next/navigation";
import { currentUserEmail } from "../../../../lib/auth/server";
import { resolveWorkspace } from "../../../../lib/workspace";
import { getPool } from "../../../../lib/db";

export const dynamic = "force-dynamic";

const money = (v: string | number) => `$${Math.round(Number(v)).toLocaleString("en-US")}`;

export default async function LeadPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = (await currentUserEmail())!;
  const ws = await resolveWorkspace(user.email);
  if (!ws) notFound();

  const sub = (
    await getPool().query(
      `SELECT s.id, s.address_line1, s.city, s.channel, s.contact_name, s.contact_email,
              s.scope_toggles, s.structural_flags, s.finish_tier, s.submitted_at,
              e.id AS estimate_id, v.id AS version_id, v.grand_total, v.range_low, v.range_high, v.swing_drivers
       FROM intake_submissions s
       LEFT JOIN estimates e ON e.id = s.estimate_id
       LEFT JOIN estimate_versions v ON v.id = e.current_version_id
       WHERE s.id = $1 AND s.org_id = $2 AND s.deleted_at IS NULL`,
      [id, ws.orgId]
    )
  ).rows[0];
  if (!sub) notFound();

  const hints = (
    await getPool().query(
      `SELECT id, kind, text, source_excerpt FROM intake_scope_hints
       WHERE intake_submission_id = $1 AND deleted_at IS NULL AND dismissed_at IS NULL
       ORDER BY kind, id`,
      [id]
    )
  ).rows;

  const toggles = Object.entries(
    (sub.scope_toggles ?? {}) as Record<string, { on: boolean; class: string | null }>
  ).filter(([, v]) => v.on);
  const drivers = ((sub.swing_drivers ?? []) as { driver: string; widen_amount_pct: number }[]).slice(0, 3);

  return (
    <main className="gci-page">
      <header className="gci-chrome">
        <span className="gci-gc-name">{ws.orgName}</span>
        <a href="/app">← Leads</a>
      </header>

      <h1>
        {sub.address_line1}, {sub.city}
      </h1>
      <p className="gci-hint">
        New lead · via {sub.channel} · {sub.contact_name} ({sub.contact_email})
      </p>

      {sub.version_id ? (
        <>
          <p className="gci-range">
            {money(sub.range_low)} – {money(sub.range_high)}
          </p>
          <p className="gci-hint">Draft seeded from county market data. Your edit is the price.</p>

          <h2>Why this range</h2>
          <ul>
            {drivers.map((d) => (
              <li key={d.driver}>
                {d.driver} · +{d.widen_amount_pct}% uncertainty
              </li>
            ))}
          </ul>
        </>
      ) : (
        <p className="gci-errors">
          This lead has no priced draft — generation didn&rsquo;t complete. The lead is
          safe; retry is coming with the editor.
        </p>
      )}

      <h2>Scope</h2>
      <p>
        {toggles.map(([k, v]) => (
          <span key={k} className="gci-chip">
            {k}
            {v.class ? ` · ${v.class.replace("_", " ")}` : " · class not chosen"}
          </span>
        ))}
        {sub.finish_tier && <span className="gci-chip">finish: {sub.finish_tier}</span>}
      </p>

      {hints.length > 0 && (
        <section className="gci-quarantine">
          <h2>
            From their description <span className="gci-badge">not priced</span>
          </h2>
          <ul>
            {hints.map((h) => (
              <li key={h.id}>
                <strong>{h.kind === "risk_flag" ? "⚠ " : ""}</strong>
                {h.text}
                {h.source_excerpt && <div className="gci-hint">“{h.source_excerpt}”</div>}
              </li>
            ))}
          </ul>
        </section>
      )}
    </main>
  );
}
