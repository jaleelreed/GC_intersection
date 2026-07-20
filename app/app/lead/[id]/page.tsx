// The reveal (E design §3): the range huge, drivers named, hints quarantined.
import { notFound } from "next/navigation";
import { currentUserEmail } from "../../../../lib/auth/server";
import { resolveWorkspace } from "../../../../lib/workspace";
import { getPool, orgQuery } from "../../../../lib/db";
import { SendBid } from "../../../../components/estimate/SendBid";
import { StageControl } from "../../../../components/leads/StageControl";
import { LeadNotes } from "../../../../components/leads/LeadNotes";
import { listNotes, type LeadStage } from "../../../../lib/leads/repo";
import { listVersions, coverageGaps } from "../../../../lib/estimate/read";
import { VersionHistory } from "../../../../components/estimate/VersionHistory";
import { listPhotoIds } from "../../../../lib/intake/photos";

export const dynamic = "force-dynamic";

const money = (v: string | number) => `$${Math.round(Number(v)).toLocaleString("en-US")}`;

export default async function LeadPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = (await currentUserEmail())!;
  const ws = await resolveWorkspace(user.email);
  if (!ws) notFound();

  const sub = (
    await orgQuery(
      ws.orgId,
      `SELECT s.id, s.address_line1, s.city, s.channel, s.contact_name, s.contact_email,
              s.scope_toggles, s.structural_flags, s.finish_tier, s.submitted_at, s.pipeline_stage,
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
  const notes = await listNotes(ws.orgId, id);
  const versions = sub.estimate_id ? await listVersions(sub.estimate_id, ws.orgId) : [];
  const gaps = await coverageGaps(id, ws.orgId);
  const photoIds = await listPhotoIds(ws.orgId, id);

  return (
    <main className="ui-rise mx-auto max-w-2xl px-4 py-6">
      <p className="mb-4 text-sm">
        <a href="/app" className="text-muted transition-colors hover:text-ink">← Leads</a>
      </p>

      <StageControl leadId={id} stage={sub.pipeline_stage as LeadStage} />

      {gaps.length > 0 && (
        <div
          className="mb-5 rounded-xl border border-danger bg-accent-soft p-4 text-sm text-ink"
          role="alert"
        >
          <strong className="text-danger">Coverage gap:</strong> the homeowner asked for{" "}
          {gaps.join(", ")} but the draft has no priced line for{" "}
          {gaps.length === 1 ? "it" : "them"}. Add {gaps.length === 1 ? "a line" : "lines"} in
          the editor, or note the exclusion, before you send.
        </div>
      )}

      <h1 className="font-display text-3xl font-bold text-ink">
        {sub.address_line1}, {sub.city}
      </h1>
      <p className="mt-1 text-sm text-muted">
        New lead · via {sub.channel} · {sub.contact_name} ({sub.contact_email})
      </p>

      {sub.version_id ? (
        <>
          <section className="ui-card mt-6 p-6">
            <p className="font-display text-5xl font-bold tracking-tight tabular-nums text-ink">
              {money(sub.range_low)} – {money(sub.range_high)}
            </p>
            <p className="mt-2 text-sm text-muted">
              Draft seeded from county market data. Your edit is the price.
            </p>

            <h2 className="mt-6 text-base font-bold text-ink">Why this range</h2>
            <ul className="mt-3 space-y-2">
              {drivers.map((d) => (
                <li
                  key={d.driver}
                  className="flex items-center justify-between rounded-lg border border-line bg-bg px-3 py-2 text-sm"
                >
                  <span className="text-ink">{d.driver}</span>
                  <span className="ui-chip">+{d.widen_amount_pct}% uncertainty</span>
                </li>
              ))}
            </ul>
            <div className="mt-6">
              <a className="ui-btn ui-btn-primary" href={`/app/lead/${id}/edit`}>
                Edit to your prices →
              </a>
            </div>
          </section>
          <SendBid
            versionId={sub.version_id}
            defaultName={sub.contact_name ?? ""}
            defaultEmail={sub.contact_email ?? ""}
          />
        </>
      ) : (
        <p className="mt-6 rounded-xl border border-danger bg-accent-soft p-4 text-sm text-ink">
          This lead has no priced draft — generation didn&rsquo;t complete. The lead is
          safe; retry is coming with the editor.
        </p>
      )}

      <h2 className="mt-10 text-lg font-bold text-ink">Scope</h2>
      <div className="mt-3 flex flex-wrap gap-2">
        {toggles.map(([k, v]) => (
          <span
            key={k}
            className="inline-flex items-center rounded-full bg-raised px-3 py-1 text-sm font-medium text-muted"
          >
            {k}
            {v.class ? ` · ${v.class.replace("_", " ")}` : " · class not chosen"}
          </span>
        ))}
        {sub.finish_tier && (
          <span className="inline-flex items-center rounded-full bg-raised px-3 py-1 text-sm font-medium text-muted">
            finish: {sub.finish_tier}
          </span>
        )}
      </div>

      {hints.length > 0 && (
        <section className="ui-card mt-8 p-6">
          <h2 className="flex items-center gap-2 text-lg font-bold text-ink">
            From their description
            <span className="inline-flex items-center rounded-full bg-raised px-2.5 py-0.5 text-xs font-semibold text-muted">
              not priced
            </span>
          </h2>
          <ul className="mt-4 space-y-3">
            {hints.map((h) => (
              <li key={h.id} className="text-sm text-ink">
                <strong>{h.kind === "risk_flag" ? "⚠ " : ""}</strong>
                {h.text}
                {h.source_excerpt && (
                  <div className="mt-1 text-sm text-faint">“{h.source_excerpt}”</div>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      {photoIds.length > 0 && (
        <section className="mt-8">
          <h2 className="text-lg font-bold text-ink">Photos from the homeowner</h2>
          <div className="mt-4 grid grid-cols-3 gap-3 sm:grid-cols-4">
            {photoIds.map((pid) => (
              <a
                key={pid}
                href={`/api/intake-photo/${pid}`}
                target="_blank"
                rel="noreferrer"
                className="overflow-hidden rounded-lg border border-line"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={`/api/intake-photo/${pid}`}
                  alt="homeowner photo"
                  className="aspect-square w-full object-cover"
                />
              </a>
            ))}
          </div>
        </section>
      )}

      <VersionHistory versions={versions} />

      <LeadNotes leadId={id} initial={notes} />
    </main>
  );
}
