// Gap 6: workspace settings.
import { currentUserEmail } from "../../../lib/auth/server";
import { resolveWorkspace } from "../../../lib/workspace";
import { ensureWorkspace } from "../../../lib/onboarding/provision";
import { serviceAreaOptions, listMarkupTemplates } from "../../../lib/settings/repo";
import { SettingsForm } from "../../../components/settings/SettingsForm";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const user = (await currentUserEmail())!;
  const ws = (await resolveWorkspace(user.email)) ?? (await ensureWorkspace(user.email, user.name));

  const [counties, markups] = await Promise.all([
    serviceAreaOptions(ws.orgId),
    listMarkupTemplates(ws.orgId),
  ]);

  return (
    <main className="gci-page">
      <p className="gci-back"><a href="/app">← Leads</a></p>
      <h1>Settings</h1>
      {ws.role !== "owner_admin" ? (
        <p className="gci-hint">Only the workspace owner can change settings.</p>
      ) : (
        <SettingsForm orgName={ws.orgName} counties={counties} markups={markups} />
      )}
    </main>
  );
}
