// The editor screen (US-014/015). Server-loads the current version; the
// client editor drives edits through the engine.
import { notFound } from "next/navigation";
import Link from "next/link";
import { currentUserEmail } from "../../../../../lib/auth/server";
import { resolveWorkspace } from "../../../../../lib/workspace";
import { currentEstimateForLead } from "../../../../../lib/estimate/read";
import { EstimateEditor } from "../../../../../components/estimate/EstimateEditor";

export const dynamic = "force-dynamic";

export default async function EditEstimatePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = (await currentUserEmail())!;
  const ws = await resolveWorkspace(user.email);
  if (!ws) notFound();

  const estimate = await currentEstimateForLead(id, ws.orgId);
  if (!estimate) notFound();

  return (
    <main className="gci-page gci-wide">
      <header className="gci-chrome">
        <span className="gci-gc-name">{ws.orgName}</span>
        <Link href={`/app/lead/${id}`}>← Lead</Link>
      </header>
      <h1>Edit estimate</h1>
      <p className="gci-hint">
        {estimate.addressLine1} · v{estimate.versionNo}
        {estimate.locked && " · accepted (locked)"}
      </p>
      {estimate.locked ? (
        <p className="gci-errors">
          This estimate was accepted and is frozen. Nothing can change it — that&rsquo;s
          the record of what was agreed.
        </p>
      ) : (
        <EstimateEditor estimate={estimate} />
      )}
    </main>
  );
}
