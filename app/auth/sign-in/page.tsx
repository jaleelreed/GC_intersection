"use client";
// Passwordless sign-in (Neon Auth email OTP), redesigned. Enter email → code.
import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { authClient } from "../../../lib/auth/client";
import { ThemeToggle } from "../../../components/ui/ThemeToggle";

type Step = "email" | "code";

export default function SignInPage() {
  const router = useRouter();
  const [step, setStep] = useState<Step>("email");
  const [email, setEmail] = useState("");
  const [otp, setOtp] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function sendCode(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const { error } = await authClient.emailOtp.sendVerificationOtp({ email, type: "sign-in" });
      if (error) setError(error.message ?? "Could not send the code — check the email and try again.");
      else {
        setStep("code");
        setNotice(`We sent a 6-digit code to ${email}.`);
      }
    } catch {
      setError("Network problem — try again.");
    } finally {
      setBusy(false);
    }
  }

  async function verify(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const { error } = await authClient.signIn.emailOtp({ email, otp });
      if (error) setError(error.message ?? "That code didn't match. Try again, or resend.");
      else {
        await fetch("/api/onboarding/provision", { method: "POST" }).catch(() => {});
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
    <div className="grid min-h-dvh place-items-center bg-bg px-5 text-ink">
      <div className="absolute right-5 top-5 flex items-center gap-2">
        <ThemeToggle />
      </div>
      <div className="ui-rise w-full max-w-sm">
        <Link href="/" className="mb-8 flex items-center justify-center gap-2 font-display text-lg font-bold">
          <span className="grid h-7 w-7 place-items-center rounded-lg bg-accent text-accent-foreground text-sm">G</span>
          GC_intersection
        </Link>

        <div className="ui-card p-7">
          {step === "email" ? (
            <form onSubmit={sendCode}>
              <h1 className="text-2xl font-bold">Sign in</h1>
              <p className="mt-1 text-sm text-muted">No password. We&rsquo;ll email you a one-time code.</p>
              {error && <p className="mt-4 rounded-lg border border-danger/40 bg-danger/10 px-3 py-2 text-sm text-danger">{error}</p>}
              <label className="ui-label mt-5">Email</label>
              <input type="email" required autoFocus value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" className="ui-input" placeholder="you@company.com" />
              <button type="submit" disabled={busy} className="ui-btn ui-btn-primary mt-5 w-full">
                {busy ? "Sending…" : "Email me a code"}
              </button>
            </form>
          ) : (
            <form onSubmit={verify}>
              <h1 className="text-2xl font-bold">Enter your code</h1>
              {notice && <p className="mt-1 text-sm text-muted">{notice}</p>}
              {error && <p className="mt-4 rounded-lg border border-danger/40 bg-danger/10 px-3 py-2 text-sm text-danger">{error}</p>}
              <label className="ui-label mt-5">6-digit code</label>
              <input inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]*" maxLength={6} required autoFocus
                value={otp} onChange={(e) => setOtp(e.target.value.replace(/\D/g, ""))}
                className="ui-input text-center text-2xl tracking-[0.5em]" placeholder="000000" />
              <button type="submit" disabled={busy || otp.length < 6} className="ui-btn ui-btn-primary mt-5 w-full">
                {busy ? "Verifying…" : "Sign in"}
              </button>
              <button type="button" className="ui-btn ui-btn-quiet mt-2 w-full" onClick={() => { setStep("email"); setOtp(""); setError(null); setNotice(null); }}>
                ← Use a different email
              </button>
            </form>
          )}
        </div>
        <p className="mt-5 text-center text-xs text-faint">By continuing you agree to our <Link href="/legal/terms" className="underline">Terms</Link>.</p>
      </div>
    </div>
  );
}
