// Gap 7: sent bids — status at a glance, resend/withdraw live ones.
import Link from "next/link";
import { currentUserEmail } from "../../../lib/auth/server";
import { resolveWorkspace } from "../../../lib/workspace";
import { ensureWorkspace } from "../../../lib/onboarding/provision";
import { listProposals } from "../../../lib/proposals/repo";
import { ProposalActions } from "../../../components/proposal/ProposalActions";

export const dynamic = "force-dynamic";

const money = (v: string | number) => `$${Math.round(Number(v)).toLocaleString("en-US")}`;

const STATUS_LABEL: Record<string, string> = {
  sent: "Sent",
  viewed: "Viewed",
  accepted: "Accepted",
  declined: "Declined",
  expired: "Expired",
  withdrawn: "Withdrawn",
  draft: "Draft",
};

const STATUS_TONE: Record<string, string> = {
  accepted: "text-positive",
  declined: "text-danger",
  withdrawn: "text-danger",
  expired: "text-danger",
  viewed: "text-accent",
};

export default async function BidsPage() {
  const user = (await currentUserEmail())!;
  const ws = (await resolveWorkspace(user.email)) ?? (await ensureWorkspace(user.email, user.name));
  const proposals = await listProposals(ws.orgId);

  return (
    <main className="ui-rise mx-auto max-w-3xl px-5 py-8">
      <p className="mb-3"><a href="/app" className="text-sm font-semibold text-muted hover:text-ink">← Leads</a></p>
      <h1 className="font-display text-3xl font-bold">Bids</h1>
      {proposals.length === 0 ? (
        <p className="mt-4 text-sm text-muted">No bids sent yet. Open a priced lead and send one.</p>
      ) : (
        <ul className="mt-6 divide-y divide-line">
          {proposals.map((p) => (
            <li key={p.id} className="py-4">
              <div className="flex items-baseline justify-between gap-3">
                {p.submission_id ? (
                  <Link href={`/app/lead/${p.submission_id}`} className="font-display text-base font-semibold hover:text-accent"><strong>{p.project_name}</strong></Link>
                ) : (
                  <strong className="font-display text-base font-semibold">{p.project_name}</strong>
                )}
                <span className="font-display text-base font-bold tabular-nums">{money(p.grand_total)}</span>
              </div>
              <div className="mt-1 text-sm text-muted">
                <span className={`font-semibold ${STATUS_TONE[p.status] ?? "text-muted"}`}>{STATUS_LABEL[p.status] ?? p.status}</span>
                {p.recipient_email ? ` · ${p.recipient_email}` : ""}
              </div>
              <ProposalActions proposalId={p.id} status={p.status} />
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
