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
    <main className="ui-rise mx-auto max-w-2xl px-5 py-8">
      <p className="mb-4 text-sm"><a href="/app" className="text-muted hover:text-ink">← Leads</a></p>
      <h1 className="font-display text-3xl font-bold text-ink">Settings</h1>
      {ws.role !== "owner_admin" ? (
        <p className="mt-3 text-muted">Only the workspace owner can change settings.</p>
      ) : (
        <SettingsForm orgName={ws.orgName} counties={counties} markups={markups} />
      )}
    </main>
  );
}
