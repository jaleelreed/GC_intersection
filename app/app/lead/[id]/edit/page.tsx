// The editor screen (US-014/015). Server-loads the current version; the
// client editor drives edits through the engine.
import { notFound } from "next/navigation";
import Link from "next/link";
import { currentUserEmail } from "../../../../../lib/auth/server";
import { resolveWorkspace } from "../../../../../lib/workspace";
import { currentEstimateForLead, costCodeOptions } from "../../../../../lib/estimate/read";
import { EstimateEditor } from "../../../../../components/estimate/EstimateEditor";

export const dynamic = "force-dynamic";

export default async function EditEstimatePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = (await currentUserEmail())!;
  const ws = await resolveWorkspace(user.email);
  if (!ws) notFound();

  const estimate = await currentEstimateForLead(id, ws.orgId);
  if (!estimate) notFound();
  const costCodes = await costCodeOptions(ws.orgId);

  return (
    <main className="ui-rise mx-auto max-w-4xl px-4 py-6">
      <p className="mb-4 text-sm">
        <Link href={`/app/lead/${id}`} className="text-muted transition-colors hover:text-ink">
          ← Lead
        </Link>
      </p>
      <h1 className="font-display text-3xl font-bold text-ink">Edit estimate</h1>
      <p className="mt-1 text-sm text-muted">
        {estimate.addressLine1} · v{estimate.versionNo}
        {estimate.locked && " · accepted (locked)"}
      </p>
      {estimate.locked ? (
        <p className="mt-6 rounded-xl border border-danger bg-accent-soft p-4 text-sm text-ink">
          This estimate was accepted and is frozen. Nothing can change it — that&rsquo;s
          the record of what was agreed.
        </p>
      ) : (
        <EstimateEditor estimate={estimate} costCodes={costCodes} />
      )}
    </main>
  );
}
