// Rate library — the learned prices the engine uses on your drafts.
import { currentUserEmail } from "../../../lib/auth/server";
import { resolveWorkspace } from "../../../lib/workspace";
import { ensureWorkspace } from "../../../lib/onboarding/provision";
import { listRates } from "../../../lib/ratelib/repo";
import { RateLibrary } from "../../../components/ratelib/RateLibrary";

export const dynamic = "force-dynamic";

export default async function PricingPage() {
  const user = (await currentUserEmail())!;
  const ws = (await resolveWorkspace(user.email)) ?? (await ensureWorkspace(user.email, user.name));
  const rates = await listRates(ws.orgId);

  return (
    <main className="ui-rise mx-auto max-w-3xl px-5 py-8">
      <p className="mb-4 text-sm"><a href="/app" className="text-muted hover:text-ink">← Leads</a></p>
      <h1 className="font-display text-3xl font-bold text-ink">Your pricing</h1>
      <p className="mt-2 text-muted">
        Rates the engine learned from your edits and uses on new drafts. Adjust one, or revert
        it to the market seed. Your pricing is never shared with other contractors.
      </p>
      <RateLibrary rates={rates} />
    </main>
  );
}
