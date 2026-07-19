// Gap 5: the convergence dashboard. Makes the moat visible — how much the GC
// still edits (falling = the engine is learning them) and what it has learned.
import { currentUserEmail } from "../../../lib/auth/server";
import { resolveWorkspace } from "../../../lib/workspace";
import { ensureWorkspace } from "../../../lib/onboarding/provision";
import { convergenceSummary, learnedRates } from "../../../lib/insights/repo";
import { funnel, recentActivity } from "../../../lib/audit/repo";

export const dynamic = "force-dynamic";

const money = (v: string | number) =>
  `$${Number(v).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export default async function InsightsPage() {
  const user = (await currentUserEmail())!;
  const ws = (await resolveWorkspace(user.email)) ?? (await ensureWorkspace(user.email, user.name));

  const [summary, rates, fn, activity] = await Promise.all([
    convergenceSummary(ws.orgId),
    learnedRates(ws.orgId),
    funnel(ws.orgId),
    recentActivity(ws.orgId),
  ]);

  return (
    <main className="gci-page">
      <p className="gci-back"><a href="/app">← Leads</a></p>
      <h1>Insights</h1>

      <section className="gci-stat-grid">
        <div className="gci-stat">
          <div className="gci-stat-num">
            {summary.avgEditCoveragePct == null ? "—" : `${summary.avgEditCoveragePct}%`}
          </div>
          <div className="gci-hint">of lines edited per draft (lower is better — it&rsquo;s learning you)</div>
        </div>
        <div className="gci-stat">
          <div className="gci-stat-num">{summary.learnedRateCount}</div>
          <div className="gci-hint">prices learned from your edits</div>
        </div>
        <div className="gci-stat">
          <div className="gci-stat-num">{summary.estimatesEdited}/{summary.estimatesTotal}</div>
          <div className="gci-hint">estimates you&rsquo;ve refined</div>
        </div>
      </section>

      <p className="gci-hint">
        The trust floor: when new drafts need edits on under a third of lines for your job types,
        the engine has learned your pricing (D10). Every edit teaches it; nothing is pooled with
        other contractors.
      </p>

      <h2>Your funnel</h2>
      <div className="gci-funnel">
        <div className="gci-funnel-step"><span className="gci-stat-num">{fn.leads}</span><span className="gci-hint">leads</span></div>
        <div className="gci-funnel-step"><span className="gci-stat-num">{fn.quoted}</span><span className="gci-hint">quoted</span></div>
        <div className="gci-funnel-step"><span className="gci-stat-num">{fn.accepted}</span><span className="gci-hint">accepted</span></div>
        <div className="gci-funnel-step"><span className="gci-stat-num">{fn.declined}</span><span className="gci-hint">declined</span></div>
      </div>
      <p className="gci-hint">
        {fn.quoted > 0
          ? `Win rate: ${Math.round((fn.accepted / fn.quoted) * 100)}% of quoted bids accepted.`
          : "Send your first bid to start tracking your win rate."}
      </p>

      {activity.length > 0 && (
        <>
          <h2>Recent activity</h2>
          <ul className="gci-activity">
            {activity.map((a, i) => (
              <li key={i}>
                <span className="gci-act-action">{a.action}</span>
                <span className="gci-hint"> · {new Date(a.occurred_at).toLocaleString()}</span>
              </li>
            ))}
          </ul>
        </>
      )}

      <h2>What it&rsquo;s learned from you</h2>
      {rates.length === 0 ? (
        <p className="gci-hint">Nothing yet — edit a draft&rsquo;s prices and your numbers start showing up here.</p>
      ) : (
        <table className="gci-bidlines">
          <thead>
            <tr><th>Item</th><th>Code</th><th className="num">Your unit price</th></tr>
          </thead>
          <tbody>
            {rates.map((r, i) => (
              <tr key={i}>
                <td>{r.name}</td>
                <td>{r.cost_code ?? "—"}</td>
                <td className="num">{money(r.unit_cost)}/{r.uom}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </main>
  );
}
