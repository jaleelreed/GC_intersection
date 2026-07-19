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
    <main className="gci-page">
      <header className="gci-chrome">
        <span className="gci-gc-name">{link.display_name ?? "Request an estimate"}</span>
        <span className="gci-powered">Powered by GC_intersection</span>
      </header>
      <IntakeForm slug={link.slug} variant="link" />
    </main>
  );
}
