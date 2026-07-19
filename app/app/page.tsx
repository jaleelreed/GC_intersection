// The GC home: notification inbox → leads. Empty state sells the loop and
// gives them a usable, shareable link (E design §3; X-1). No workspace = an
// honest screen, not a silent org.
import Link from "next/link";
import { currentUserEmail } from "../../lib/auth/server";
import { resolveWorkspace } from "../../lib/workspace";
import { ensureWorkspace } from "../../lib/onboarding/provision";
import { inbox } from "../../lib/notifications/repo";
import { intakeLinkForOrg } from "../../lib/intake/repo";
import { ShareLink } from "../../components/app/ShareLink";

export const dynamic = "force-dynamic";

export default async function AppHome() {
  const user = (await currentUserEmail())!; // layout guards
  // Safety net: if the sign-in provisioning call was missed, provision here.
  const ws = (await resolveWorkspace(user.email)) ?? (await ensureWorkspace(user.email, user.name));

  const notes = await inbox(ws.orgId, ws.userId, { limit: 30 });
  const link = await intakeLinkForOrg(ws.orgId);

  return (
    <main className="gci-page">
      <h1>Leads</h1>

      {notes.length === 0 ? (
        <>
          <div className="gci-empty">
            <p className="gci-empty-lead">No leads yet.</p>
            <p className="gci-hint">
              Share your link below. Every submission lands here already priced — a range
              from county market data with the swing drivers named. Your edits teach it your
              real pricing, so the next draft starts closer.
            </p>
          </div>
          {link && <ShareLink slug={link.slug} />}
          <ol className="gci-steps">
            <li>Share your link (text it, or show the QR).</li>
            <li>A homeowner fills the 3-minute form.</li>
            <li>A priced draft appears here — you edit and send.</li>
          </ol>
        </>
      ) : (
        <>
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
          {link && <ShareLink slug={link.slug} compact />}
        </>
      )}
    </main>
  );
}
