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

export default async function BidsPage() {
  const user = (await currentUserEmail())!;
  const ws = (await resolveWorkspace(user.email)) ?? (await ensureWorkspace(user.email, user.name));
  const proposals = await listProposals(ws.orgId);

  return (
    <main className="gci-page">
      <p className="gci-back"><a href="/app">← Leads</a></p>
      <h1>Bids</h1>
      {proposals.length === 0 ? (
        <p className="gci-hint">No bids sent yet. Open a priced lead and send one.</p>
      ) : (
        <ul className="gci-leads">
          {proposals.map((p) => (
            <li key={p.id}>
              <div className="gci-lead-row">
                {p.submission_id ? (
                  <Link href={`/app/lead/${p.submission_id}`}><strong>{p.project_name}</strong></Link>
                ) : (
                  <strong>{p.project_name}</strong>
                )}
                <span className="gci-lead-total">{money(p.grand_total)}</span>
              </div>
              <span className="gci-hint">
                <span className={`gci-status gci-status-${p.status}`}>{STATUS_LABEL[p.status] ?? p.status}</span>
                {p.recipient_email ? ` · ${p.recipient_email}` : ""}
              </span>
              <ProposalActions proposalId={p.id} status={p.status} />
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
