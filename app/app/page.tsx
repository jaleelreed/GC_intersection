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
    <main className="ui-rise mx-auto max-w-3xl px-4 py-8">
      <h1 className="font-display text-3xl font-bold">Leads</h1>

      {total === 0 ? (
        <>
          <div className="ui-card mt-6 p-6">
            <p className="font-display text-xl font-bold">No leads yet.</p>
            <p className="mt-2 text-muted">
              Share your link below. Every submission lands here already priced — a range
              from county market data with the swing drivers named. Your edits teach it your
              real pricing, so the next draft starts closer.
            </p>
          </div>
          {link && (
            <div className="mt-6">
              <ShareLink slug={link.slug} />
            </div>
          )}
          <ol className="mt-6 space-y-2 pl-5 text-muted marker:font-semibold marker:text-accent [list-style:decimal]">
            <li>Share your link (text it, or show the QR).</li>
            <li>A homeowner fills the 3-minute form.</li>
            <li>A priced draft appears here — you edit and send.</li>
          </ol>
        </>
      ) : (
        <>
          <nav className="mt-6 flex flex-wrap gap-2" aria-label="Pipeline">
            <Link
              href="/app"
              className={`ui-btn rounded-full px-4 text-sm ${
                !active ? "bg-ink text-[color:var(--bg)]" : "border-line bg-surface text-muted hover:text-ink"
              }`}
            >
              All {total}
            </Link>
            {LEAD_STAGES.map((s) => (
              <Link
                key={s}
                href={`/app?stage=${s}`}
                className={`ui-btn rounded-full px-4 text-sm ${
                  active === s ? "bg-accent text-accent-foreground" : "border-line bg-surface text-muted hover:text-ink"
                }`}
              >
                {STAGE_LABEL[s]} {counts[s]}
              </Link>
            ))}
          </nav>

          <ul className="ui-card mt-6 divide-y divide-line overflow-hidden">
            {leads.map((l) => (
              <li key={l.id}>
                <Link href={`/app/lead/${l.id}`} className="block px-5 py-4 transition-colors hover:bg-accent-soft">
                  <div className="flex items-baseline justify-between gap-3">
                    <strong className="font-semibold text-ink">
                      {l.address_line1}, {l.city}
                    </strong>
                    <span className="tabular-nums font-semibold text-ink">
                      {l.range_low != null
                        ? `${money(l.range_low)}–${money(l.range_high)}`
                        : money(l.grand_total)}
                    </span>
                  </div>
                  <span className="mt-1 block text-sm text-muted">
                    {STAGE_LABEL[l.pipeline_stage]} · via {l.channel}
                    {l.contact_name ? ` · ${l.contact_name}` : ""}
                  </span>
                </Link>
              </li>
            ))}
            {leads.length === 0 && <li className="px-5 py-4 text-sm text-muted">No leads in this stage.</li>}
          </ul>

          {link && (
            <div className="mt-6">
              <ShareLink slug={link.slug} compact />
            </div>
          )}
        </>
      )}
    </main>
  );
}
