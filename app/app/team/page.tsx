// Gap 8: team + account.
import { currentUserEmail } from "../../../lib/auth/server";
import { resolveWorkspace } from "../../../lib/workspace";
import { ensureWorkspace } from "../../../lib/onboarding/provision";
import { listMembers } from "../../../lib/team/repo";
import { TeamManager } from "../../../components/team/TeamManager";
import { AccountControls } from "../../../components/account/AccountControls";

export const dynamic = "force-dynamic";

export default async function TeamPage() {
  const user = (await currentUserEmail())!;
  const ws = (await resolveWorkspace(user.email)) ?? (await ensureWorkspace(user.email, user.name));
  const members = await listMembers(ws.orgId, ws.userId);

  return (
    <main className="ui-rise mx-auto max-w-2xl px-5 py-8">
      <p className="mb-4 text-sm"><a href="/app" className="text-muted hover:text-ink">← Leads</a></p>
      <h1 className="font-display text-3xl font-bold text-ink">Team</h1>

      <section className="ui-card mt-6 p-6">
        <h2 className="font-display text-lg font-bold text-ink">Your account</h2>
        <p className="mt-1 text-sm text-muted">Signed in as <strong className="text-ink">{user.email}</strong> · {ws.role.replace("_", " ")}</p>
        <p className="mt-1 text-sm text-muted">Use “Sign out” in the top bar to end your session.</p>
      </section>

      {ws.role === "owner_admin" ? (
        <>
          <TeamManager members={members} />
          <AccountControls orgName={ws.orgName} />
        </>
      ) : (
        <section className="ui-card mt-6 p-6">
          <h2 className="font-display text-lg font-bold text-ink">Members</h2>
          <ul className="mt-4 divide-y divide-line">
            {members.map((m) => (
              <li key={m.membership_id} className="py-2.5">
                <strong className="text-ink">{m.full_name || m.email}</strong>
                <span className="text-sm text-muted"> · {m.role.replace("_", " ")}</span>
              </li>
            ))}
          </ul>
          <p className="mt-3 text-sm text-muted">Only the workspace owner can invite or remove teammates.</p>
        </section>
      )}
    </main>
  );
}
