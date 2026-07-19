// The GC home: the lead pipeline. Stage filter + counts, each lead priced.
// Empty state gives them a usable, shareable link (X-1). No workspace = an
// honest screen, not a silent org.
import Link from "next/link";
import { currentUserEmail } from "../../lib/auth/server";
import { resolveWorkspace } from "../../lib/workspace";
import { ensureWorkspace } from "../../lib/onboarding/provision";
import { intakeLinkForOrg } from "../../lib/intake/repo";
import { listLeads, stageCounts, LEAD_STAGES, type LeadStage } from "../../lib/leads/repo";
import { ShareLink } from "../../components/app/ShareLink";

export const dynamic = "force-dynamic";

const money = (v: string | number | null) =>
  v == null ? "—" : `$${Math.round(Number(v)).toLocaleString("en-US")}`;

const STAGE_LABEL: Record<LeadStage, string> = {
  new: "New",
  contacted: "Contacted",
  quoted: "Quoted",
  won: "Won",
  lost: "Lost",
};

export default async function AppHome({
  searchParams,
}: {
  searchParams: Promise<{ stage?: string }>;
}) {
  const user = (await currentUserEmail())!; // layout guards
  const ws = (await resolveWorkspace(user.email)) ?? (await ensureWorkspace(user.email, user.name));

  const { stage } = await searchParams;
  const active = LEAD_STAGES.includes(stage as LeadStage) ? (stage as LeadStage) : undefined;

  const [leads, counts, link] = await Promise.all([
    listLeads(ws.orgId, { stage: active }),
    stageCounts(ws.orgId),
    intakeLinkForOrg(ws.orgId),
  ]);
  const total = Object.values(counts).reduce((a, b) => a + b, 0);

  return (
    <main className="gci-page">
      <h1>Leads</h1>

      {total === 0 ? (
        <>
          <div className="gci-empty">
            <p className="gci-empty-lead">No leads yet.</p>
            <p className="gci-hint">
              Share your link below. Every submission lands here already priced — a range
              from county market data with the swing drivers named. Your edits teach it your
              real pricing, so the next draft starts closer.
            </p>
          </div>
          {link && <ShareLink slug={link.slug} />}
          <ol className="gci-steps">
            <li>Share your link (text it, or show the QR).</li>
            <li>A homeowner fills the 3-minute form.</li>
            <li>A priced draft appears here — you edit and send.</li>
          </ol>
        </>
      ) : (
        <>
          <nav className="gci-pipeline" aria-label="Pipeline">
            <Link href="/app" className={`gci-pill ${!active ? "sel" : ""}`}>
              All {total}
            </Link>
            {LEAD_STAGES.map((s) => (
              <Link
                key={s}
                href={`/app?stage=${s}`}
                className={`gci-pill gci-stage-${s} ${active === s ? "sel" : ""}`}
              >
                {STAGE_LABEL[s]} {counts[s]}
              </Link>
            ))}
          </nav>

          <ul className="gci-leads">
            {leads.map((l) => (
              <li key={l.id}>
                <Link href={`/app/lead/${l.id}`}>
                  <div className="gci-lead-row">
                    <strong>
                      {l.address_line1}, {l.city}
                    </strong>
                    <span className="gci-lead-total">
                      {l.range_low != null
                        ? `${money(l.range_low)}–${money(l.range_high)}`
                        : money(l.grand_total)}
                    </span>
                  </div>
                  <span className="gci-hint">
                    {STAGE_LABEL[l.pipeline_stage]} · via {l.channel}
                    {l.contact_name ? ` · ${l.contact_name}` : ""}
                  </span>
                </Link>
              </li>
            ))}
            {leads.length === 0 && <li className="gci-hint">No leads in this stage.</li>}
          </ul>

          {link && <ShareLink slug={link.slug} compact />}
        </>
      )}
    </main>
  );
}
