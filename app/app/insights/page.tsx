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
    <main className="ui-rise mx-auto max-w-3xl px-5 py-8">
      <p className="mb-3"><a href="/app" className="text-sm font-semibold text-muted hover:text-ink">← Leads</a></p>
      <h1 className="font-display text-3xl font-bold">Insights</h1>

      <section className="mt-6 grid gap-4 sm:grid-cols-3">
        <div className="ui-card p-5">
          <div className="font-display text-3xl font-bold tabular-nums">
            {summary.avgEditCoveragePct == null ? "—" : `${summary.avgEditCoveragePct}%`}
          </div>
          <div className="mt-1 text-sm text-muted">of lines edited per draft (lower is better — it&rsquo;s learning you)</div>
        </div>
        <div className="ui-card p-5">
          <div className="font-display text-3xl font-bold tabular-nums">{summary.learnedRateCount}</div>
          <div className="mt-1 text-sm text-muted">prices learned from your edits</div>
        </div>
        <div className="ui-card p-5">
          <div className="font-display text-3xl font-bold tabular-nums">{summary.estimatesEdited}/{summary.estimatesTotal}</div>
          <div className="mt-1 text-sm text-muted">estimates you&rsquo;ve refined</div>
        </div>
      </section>

      <p className="mt-4 text-sm text-muted">
        The trust floor: when new drafts need edits on under a third of lines for your job types,
        the engine has learned your pricing (D10). Every edit teaches it; nothing is pooled with
        other contractors.
      </p>

      <h2 className="mt-8 font-display text-lg font-semibold">Your funnel</h2>
      <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="rounded-xl border border-line p-4 text-center"><span className="block font-display text-3xl font-bold tabular-nums">{fn.leads}</span><span className="mt-1 block text-sm text-muted">leads</span></div>
        <div className="rounded-xl border border-line p-4 text-center"><span className="block font-display text-3xl font-bold tabular-nums">{fn.quoted}</span><span className="mt-1 block text-sm text-muted">quoted</span></div>
        <div className="rounded-xl border border-line p-4 text-center"><span className="block font-display text-3xl font-bold tabular-nums">{fn.accepted}</span><span className="mt-1 block text-sm text-muted">accepted</span></div>
        <div className="rounded-xl border border-line p-4 text-center"><span className="block font-display text-3xl font-bold tabular-nums">{fn.declined}</span><span className="mt-1 block text-sm text-muted">declined</span></div>
      </div>
      <p className="mt-3 text-sm text-muted">
        {fn.quoted > 0
          ? `Win rate: ${Math.round((fn.accepted / fn.quoted) * 100)}% of quoted bids accepted.`
          : "Send your first bid to start tracking your win rate."}
      </p>

      {activity.length > 0 && (
        <>
          <h2 className="mt-8 font-display text-lg font-semibold">Recent activity</h2>
          <ul className="mt-3 divide-y divide-line">
            {activity.map((a, i) => (
              <li key={i} className="py-2 text-sm">
                <span className="font-semibold">{a.action}</span>
                <span className="text-faint"> · {new Date(a.occurred_at).toLocaleString()}</span>
              </li>
            ))}
          </ul>
        </>
      )}

      <h2 className="mt-8 font-display text-lg font-semibold">What it&rsquo;s learned from you</h2>
      {rates.length === 0 ? (
        <p className="mt-3 text-sm text-muted">Nothing yet — edit a draft&rsquo;s prices and your numbers start showing up here.</p>
      ) : (
        <table className="mt-3 w-full text-sm">
          <thead>
            <tr className="border-b border-line text-left text-muted">
              <th className="py-2 font-semibold">Item</th>
              <th className="py-2 font-semibold">Code</th>
              <th className="py-2 text-right font-semibold">Your unit price</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {rates.map((r, i) => (
              <tr key={i}>
                <td className="py-2">{r.name}</td>
                <td className="py-2">{r.cost_code ?? "—"}</td>
                <td className="py-2 text-right tabular-nums">{money(r.unit_cost)}/{r.uom}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </main>
  );
}
