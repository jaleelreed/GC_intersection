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
    <main className="mx-auto max-w-3xl bg-bg px-5 py-8 text-ink">
      <div className="ui-card ui-rise p-6 sm:p-9">
        <header className="flex items-baseline justify-between gap-3 border-b border-line pb-4">
          <span className="font-display text-xl font-bold">{view.orgName}</span>
          <PrintButton />
        </header>

        <h1 className="mt-6 text-3xl font-bold">Estimate for {view.projectName}</h1>
        {view.recipientName && <p className="mt-1 text-sm text-muted">Prepared for {view.recipientName}</p>}
        {view.expiresAt && (
          <p className="text-sm text-muted">Valid until {new Date(view.expiresAt).toLocaleDateString()}</p>
        )}

        {view.coverNote && <p className="mt-4 leading-relaxed text-muted">{view.coverNote}</p>}

        {lines.filter((l) => !l.is_alternate).length > 0 && (
          <table className="mt-6 w-full border-collapse text-sm">
            <tbody>
              {lines.filter((l) => !l.is_alternate).map((l, i) => (
                <tr key={i} className="border-b border-line">
                  <td className="py-3 pr-4">{l.description}{l.is_allowance && <span className="text-muted"> (allowance)</span>}</td>
                  <td className="py-3 text-right tabular-nums">{money(l.total)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        <p className="mt-6 text-right font-display text-3xl font-bold tabular-nums">{money(view.grandTotal)}</p>

        {lines.some((l) => l.is_alternate) && (
          <section className="mt-8">
            <h2 className="text-lg font-bold">Optional add-ons</h2>
            <p className="text-sm text-muted">Not included in the total above — available if you want them.</p>
            <table className="mt-3 w-full border-collapse text-sm">
              <tbody>
                {lines.filter((l) => l.is_alternate).map((l, i) => (
                  <tr key={i} className="border-b border-line">
                    <td className="py-3 pr-4">{l.description}</td>
                    <td className="py-3 text-right tabular-nums">+{money(l.total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        )}
        {view.rangeLow != null && view.rangeHigh != null && (
          <p className="mt-3 text-sm text-muted">Estimated range {money(view.rangeLow)} – {money(view.rangeHigh)}</p>
        )}

        {(view.inclusions || view.exclusions || view.terms) && (
          <div className="mt-8 grid gap-5">
            {view.inclusions && (
              <div><h2 className="text-lg font-bold">Included</h2><p className="mt-1 leading-relaxed text-muted">{view.inclusions}</p></div>
            )}
            {view.exclusions && (
              <div><h2 className="text-lg font-bold">Not included</h2><p className="mt-1 leading-relaxed text-muted">{view.exclusions}</p></div>
            )}
            {view.terms && (
              <div><h2 className="text-lg font-bold">Terms</h2><p className="mt-1 leading-relaxed text-muted">{view.terms}</p></div>
            )}
          </div>
        )}

        <div className="mt-8 border-t border-line pt-6 print:hidden">
          <AcceptBid token={token} initialStatus={view.status} />
        </div>

        <p className="mt-6 text-xs leading-relaxed text-faint">
          This is an estimate, not a binding contract. Final scope and price are set in a
          separate written agreement between you and the contractor. No payment is collected here.
        </p>

        <footer className="mt-6 border-t border-line pt-4 text-xs text-faint">
          Prepared with BidEasy · gc-intersection.vercel.app
        </footer>
      </div>
    </main>
  );
}
