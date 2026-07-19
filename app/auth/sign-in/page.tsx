"use client";
// GC sign-in / first sign-up (Neon Auth, email + password). Contractor-grade:
// one card, two modes, no marketing.
import { useState } from "react";
import { useRouter } from "next/navigation";
import { authClient } from "../../../lib/auth/client";

export default function SignInPage() {
  const router = useRouter();
  const [mode, setMode] = useState<"sign-in" | "sign-up">("sign-in");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const result =
        mode === "sign-in"
          ? await authClient.signIn.email({ email, password })
          : await authClient.signUp.email({ email, password, name: name || email });
      if (result.error) {
        setError(result.error.message ?? "Sign-in failed.");
      } else {
        router.push("/app");
        router.refresh();
      }
    } catch {
      setError("Network problem — try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="gci-page">
      <header className="gci-chrome">
        <span className="gci-gc-name">GC_intersection</span>
      </header>
      <form className="gci-form" onSubmit={submit}>
        <h1>{mode === "sign-in" ? "Sign in" : "Create your account"}</h1>
        {error && (
          <div className="gci-errors" role="alert">
            <p>{error}</p>
          </div>
        )}
        {mode === "sign-up" && (
          <label>
            Your name
            <input value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" />
          </label>
        )}
        <label>
          Email
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
          />
        </label>
        <label>
          Password
          <input
            type="password"
            required
            minLength={8}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete={mode === "sign-in" ? "current-password" : "new-password"}
          />
        </label>
        <div className="gci-nav">
          <button
            type="button"
            onClick={() => setMode(mode === "sign-in" ? "sign-up" : "sign-in")}
          >
            {mode === "sign-in" ? "New here? Create account" : "Have an account? Sign in"}
          </button>
          <button type="submit" disabled={busy} className="gci-primary">
            {busy ? "…" : mode === "sign-in" ? "Sign in" : "Create account"}
          </button>
        </div>
      </form>
    </main>
  );
}
