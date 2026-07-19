// US-024: the buyer's view of the bid. Public, token-authorized, no account.
// First view transitions the proposal to 'viewed'. Carries the product
// fingerprint (D12).
import { notFound } from "next/navigation";
import { getProposalByToken } from "../../../lib/proposals/repo";
import { AcceptBid } from "../../../components/proposal/AcceptBid";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const money = (v: string | number) => `$${Math.round(Number(v)).toLocaleString("en-US")}`;

export default async function BuyerProposalPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const view = await getProposalByToken(token);
  if (!view) notFound();

  return (
    <main className="gci-page">
      <header className="gci-chrome">
        <span className="gci-gc-name">{view.projectName}</span>
        <span className="gci-powered">via GC_intersection</span>
      </header>

      <h1>Your estimate</h1>
      {view.recipientName && <p className="gci-hint">Prepared for {view.recipientName}</p>}

      <p className="gci-range">{money(view.grandTotal)}</p>
      {view.rangeLow != null && view.rangeHigh != null && (
        <p className="gci-hint">
          Estimated range {money(view.rangeLow)} – {money(view.rangeHigh)}
        </p>
      )}

      <div style={{ marginTop: 24 }}>
        <AcceptBid token={token} initialStatus={view.status} />
      </div>
    </main>
  );
}
