// The GC home: notification inbox → leads. Empty state sells the loop (E
// design §3). No workspace = honest screen, not a silent org.
import Link from "next/link";
import { currentUserEmail } from "../../lib/auth/server";
import { resolveWorkspace } from "../../lib/workspace";
import { ensureWorkspace } from "../../lib/onboarding/provision";
import { inbox } from "../../lib/notifications/repo";
import { intakeLinkForOrg } from "../../lib/intake/repo";

export const dynamic = "force-dynamic";

export default async function AppHome() {
  const user = (await currentUserEmail())!; // layout guards
  // Safety net: if the sign-in provisioning call was missed, provision here.
  const ws = (await resolveWorkspace(user.email)) ?? (await ensureWorkspace(user.email, user.name));

  const notes = await inbox(ws.orgId, ws.userId, { limit: 30 });
  const link = await intakeLinkForOrg(ws.orgId);

  return (
    <main className="gci-page">
      <header className="gci-chrome">
        <span className="gci-gc-name">{ws.orgName}</span>
        <span className="gci-powered">{user.email}</span>
      </header>
      <h1>Leads</h1>
      {notes.length === 0 ? (
        <section>
          <p>
            <strong>No leads yet — share your intake link.</strong> Every submission
            arrives here priced: a range seeded from county market data, with the
            swing drivers named. Your edits teach it your real pricing.
          </p>
          {link && (
            <p>
              Your link: <code>/i/{link.slug}</code>
            </p>
          )}
        </section>
      ) : (
        <ul className="gci-leads">
          {notes.map((n) => (
            <li key={n.id}>
              <Link href={`/app/lead/${n.subject_id}`}>
                <strong>{n.title}</strong>
                {!n.read_at && <span className="gci-unread"> • new</span>}
                <br />
                <span className="gci-hint">{n.body}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
      <p className="gci-hint">
        Draft ranges are seeded from county market data. Your edit is the price.
      </p>
    </main>
  );
}
