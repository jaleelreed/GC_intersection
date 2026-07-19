// US-024/016: the buyer's bid document. Public, token-authorized, no account.
// First view transitions to 'viewed'. Line-item detail, print-optimized
// (Save as PDF), carries the product fingerprint (D12).
import { notFound } from "next/navigation";
import { getProposalByToken, bidLinesForToken } from "../../../lib/proposals/repo";
import { AcceptBid } from "../../../components/proposal/AcceptBid";
import { PrintButton } from "../../../components/proposal/PrintButton";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const money = (v: string | number) => `$${Math.round(Number(v)).toLocaleString("en-US")}`;

export default async function BuyerProposalPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const view = await getProposalByToken(token);
  if (!view) notFound();
  const lines = await bidLinesForToken(token);

  return (
    <main className="gci-page gci-bid">
      <header className="gci-chrome">
        <span className="gci-gc-name">{view.orgName}</span>
        <PrintButton />
      </header>

      <h1>Estimate for {view.projectName}</h1>
      {view.recipientName && <p className="gci-hint">Prepared for {view.recipientName}</p>}
      {view.expiresAt && (
        <p className="gci-hint">Valid until {new Date(view.expiresAt).toLocaleDateString()}</p>
      )}

      {view.coverNote && <p className="gci-covernote">{view.coverNote}</p>}

      {lines.length > 0 && (
        <table className="gci-bidlines">
          <tbody>
            {lines.map((l, i) => (
              <tr key={i}>
                <td>{l.description}</td>
                <td className="num">{money(l.total)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <p className="gci-range">{money(view.grandTotal)}</p>
      {view.rangeLow != null && view.rangeHigh != null && (
        <p className="gci-hint">Estimated range {money(view.rangeLow)} – {money(view.rangeHigh)}</p>
      )}

      {(view.inclusions || view.exclusions || view.terms) && (
        <div className="gci-bid-terms">
          {view.inclusions && (
            <div><h2>Included</h2><p>{view.inclusions}</p></div>
          )}
          {view.exclusions && (
            <div><h2>Not included</h2><p>{view.exclusions}</p></div>
          )}
          {view.terms && (
            <div><h2>Terms</h2><p>{view.terms}</p></div>
          )}
        </div>
      )}

      <div className="gci-accept-area">
        <AcceptBid token={token} initialStatus={view.status} />
      </div>

      <p className="gci-hint gci-disclaimer">
        This is an estimate, not a binding contract. Final scope and price are set in a
        separate written agreement between you and the contractor. No payment is collected here.
      </p>

      <footer className="gci-fingerprint">
        Prepared with GC_intersection · gc-intersection.vercel.app
      </footer>
    </main>
  );
}
