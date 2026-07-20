// The GC platform shell: session guard + persistent workspace nav on every
// /app route. The nav lives here so no page has to re-render it.
import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { currentUserEmail } from "../../lib/auth/server";
import { resolveWorkspace } from "../../lib/workspace";
import { ensureWorkspace } from "../../lib/onboarding/provision";
import { AppShell } from "../../components/app/AppShell";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: ReactNode }) {
  const user = await currentUserEmail();
  if (!user) redirect("/auth/sign-in");
  // Workspace always exists past the door (provision as a safety net).
  const ws = (await resolveWorkspace(user.email)) ?? (await ensureWorkspace(user.email, user.name));

  return (
    <AppShell orgName={ws.orgName} email={user.email}>
      {children}
    </AppShell>
  );
}
