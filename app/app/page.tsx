// The GC home: notification inbox → leads. Empty state sells the loop (E
// design §3). No workspace = honest screen, not a silent org.
import Link from "next/link";
import { currentUserEmail } from "../../lib/auth/server";
import { resolveWorkspace } from "../../lib/workspace";
import { inbox } from "../../lib/notifications/repo";

export const dynamic = "force-dynamic";

export default async function AppHome() {
  const user = (await currentUserEmail())!; // layout guards
  const ws = await resolveWorkspace(user.email);

  if (!ws) {
    return (
      <main className="gci-page">
        <header className="gci-chrome">
          <span className="gci-gc-name">GC_intersection</span>
          <span className="gci-powered">{user.email}</span>
        </header>
        <h1>No workspace yet</h1>
        <p>
          Your sign-in works, but this email isn&rsquo;t attached to a company workspace.
          Workspace creation is coming; for now, ask the person who runs your platform
          account to add you.
        </p>
      </main>
    );
  }

  const notes = await inbox(ws.orgId, ws.userId, { limit: 30 });

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
          <p>
            Your links: <code>/i/fixture-link</code> · <code>/i/fixture-embed</code> ·{" "}
            <code>/i/fixture-qr</code>
          </p>
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
