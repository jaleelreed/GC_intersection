// The GC platform shell: server-side session guard on every /app route.
import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { currentUserEmail } from "../../lib/auth/server";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: ReactNode }) {
  const user = await currentUserEmail();
  if (!user) redirect("/auth/sign-in");
  return <>{children}</>;
}
