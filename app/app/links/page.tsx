// Gap 4: distribution — links + channel analytics.
import { currentUserEmail } from "../../../lib/auth/server";
import { resolveWorkspace } from "../../../lib/workspace";
import { ensureWorkspace } from "../../../lib/onboarding/provision";
import { listLinks, channelStats } from "../../../lib/links/repo";
import { CHANNEL_LABEL } from "../../../lib/links/types";
import { LinkManager } from "../../../components/links/LinkManager";

export const dynamic = "force-dynamic";

export default async function LinksPage() {
  const user = (await currentUserEmail())!;
  const ws = (await resolveWorkspace(user.email)) ?? (await ensureWorkspace(user.email, user.name));

  const [links, stats] = await Promise.all([listLinks(ws.orgId), channelStats(ws.orgId)]);
  const anyLeads = stats.some((s) => s.leads > 0);

  return (
    <main className="ui-rise mx-auto max-w-3xl px-5 py-8">
      <p className="mb-3"><a href="/app" className="text-sm font-semibold text-muted hover:text-ink">← Leads</a></p>
      <h1 className="font-display text-3xl font-bold">Your links</h1>

      {anyLeads && (
        <section className="ui-card mt-6 p-5">
          <h2 className="font-display text-lg font-semibold">Which door works</h2>
          <table className="mt-3 w-full text-sm">
            <thead>
              <tr className="border-b border-line text-left text-muted">
                <th className="py-2 font-semibold">Channel</th>
                <th className="py-2 text-right font-semibold">Leads</th>
                <th className="py-2 text-right font-semibold">Won</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {stats.map((s) => (
                <tr key={s.channel}>
                  <td className="py-2">{CHANNEL_LABEL[s.channel]}</td>
                  <td className="py-2 text-right tabular-nums">{s.leads}</td>
                  <td className="py-2 text-right tabular-nums">{s.won}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      <LinkManager links={links} />
    </main>
  );
}
