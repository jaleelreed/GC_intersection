"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { authClient } from "../../lib/auth/client";

export function SignOutButton() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  return (
    <button
      type="button"
      className="gci-navlink gci-signout"
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        try {
          await authClient.signOut();
        } catch {
          /* sign out is best-effort; still leave the app */
        }
        router.push("/auth/sign-in");
        router.refresh();
      }}
    >
      {busy ? "…" : "Sign out"}
    </button>
  );
}
