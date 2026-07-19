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
    <main className="gci-page">
      <p className="gci-back"><a href="/app">← Leads</a></p>
      <h1>Your links</h1>

      {anyLeads && (
        <section className="gci-share-compact gci-share">
          <h2>Which door works</h2>
          <table className="gci-bidlines">
            <thead>
              <tr><th>Channel</th><th className="num">Leads</th><th className="num">Won</th></tr>
            </thead>
            <tbody>
              {stats.map((s) => (
                <tr key={s.channel}>
                  <td>{CHANNEL_LABEL[s.channel]}</td>
                  <td className="num">{s.leads}</td>
                  <td className="num">{s.won}</td>
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
