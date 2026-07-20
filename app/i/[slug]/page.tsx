// US-005 direct-link presentation: platform chrome, GC identity slot (D12).
import { notFound } from "next/navigation";
import { findActiveLink } from "../../../lib/intake/repo";
import { IntakeForm } from "../../../components/intake/IntakeForm";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default async function IntakeLinkPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const link = await findActiveLink(slug);
  if (!link) notFound();

  return (
    <main className="min-h-dvh bg-bg text-ink">
      <div className="mx-auto max-w-2xl px-4 py-8 sm:py-12">
        <header className="mb-6 flex items-center justify-between gap-3">
          <span className="font-display text-lg font-bold text-ink">{link.display_name ?? "Request an estimate"}</span>
          <span className="text-xs text-faint">Powered by GC_intersection</span>
        </header>
        <IntakeForm slug={link.slug} variant="link" />
      </div>
    </main>
  );
}
