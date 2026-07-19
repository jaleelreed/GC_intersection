// Gap 8: team + account.
import { currentUserEmail } from "../../../lib/auth/server";
import { resolveWorkspace } from "../../../lib/workspace";
import { ensureWorkspace } from "../../../lib/onboarding/provision";
import { listMembers } from "../../../lib/team/repo";
import { TeamManager } from "../../../components/team/TeamManager";

export const dynamic = "force-dynamic";

export default async function TeamPage() {
  const user = (await currentUserEmail())!;
  const ws = (await resolveWorkspace(user.email)) ?? (await ensureWorkspace(user.email, user.name));
  const members = await listMembers(ws.orgId, ws.userId);

  return (
    <main className="gci-page">
      <p className="gci-back"><a href="/app">← Leads</a></p>
      <h1>Team</h1>

      <section className="gci-share">
        <h2>Your account</h2>
        <p className="gci-hint">Signed in as <strong>{user.email}</strong> · {ws.role.replace("_", " ")}</p>
        <p className="gci-hint">Use “Sign out” in the top bar to end your session.</p>
      </section>

      {ws.role === "owner_admin" ? (
        <TeamManager members={members} />
      ) : (
        <>
          <h2>Members</h2>
          <ul className="gci-leads">
            {members.map((m) => (
              <li key={m.membership_id}>
                <strong>{m.full_name || m.email}</strong>
                <span className="gci-hint"> · {m.role.replace("_", " ")}</span>
              </li>
            ))}
          </ul>
          <p className="gci-hint">Only the workspace owner can invite or remove teammates.</p>
        </>
      )}
    </main>
  );
}
