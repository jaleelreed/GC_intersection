// US-005 embed presentation: same component, no chrome, iframe-safe;
// inherits the host site's visual context (D5).
import { notFound } from "next/navigation";
import { findActiveLink } from "../../../../lib/intake/repo";
import { IntakeForm } from "../../../../components/intake/IntakeForm";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default async function IntakeEmbedPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const link = await findActiveLink(slug);
  if (!link) notFound();

  return <IntakeForm slug={link.slug} variant="embed" />;
}
