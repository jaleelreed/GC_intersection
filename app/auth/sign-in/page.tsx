"use client";
// Passwordless sign-in (Neon Auth email OTP): enter email → receive a code →
// in. No password is ever created, chosen, or stored — the operator's
// standing preference and the right fit for a phone-at-the-jobsite audience.
// Neon Auth sends the code with its built-in email provider; no external
// email service to configure.
import { useState } from "react";
import { useRouter } from "next/navigation";
import { authClient } from "../../../lib/auth/client";

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
      if (error) {
        setError(error.message ?? "Could not send the code — check the email and try again.");
      } else {
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
      if (error) {
        setError(error.message ?? "That code didn't match. Try again, or resend.");
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

      {step === "email" ? (
        <form className="gci-form" onSubmit={sendCode}>
          <h1>Sign in</h1>
          <p className="gci-hint">No password. We&rsquo;ll email you a one-time code.</p>
          {error && (
            <div className="gci-errors" role="alert">
              <p>{error}</p>
            </div>
          )}
          <label>
            Email
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
              autoFocus
            />
          </label>
          <div className="gci-nav">
            <button type="submit" disabled={busy} className="gci-primary">
              {busy ? "Sending…" : "Email me a code"}
            </button>
          </div>
        </form>
      ) : (
        <form className="gci-form" onSubmit={verify}>
          <h1>Enter your code</h1>
          {notice && <p className="gci-hint">{notice}</p>}
          {error && (
            <div className="gci-errors" role="alert">
              <p>{error}</p>
            </div>
          )}
          <label>
            6-digit code
            <input
              inputMode="numeric"
              autoComplete="one-time-code"
              pattern="[0-9]*"
              maxLength={6}
              required
              value={otp}
              onChange={(e) => setOtp(e.target.value.replace(/\D/g, ""))}
              autoFocus
            />
          </label>
          <div className="gci-nav">
            <button
              type="button"
              onClick={() => {
                setStep("email");
                setOtp("");
                setError(null);
                setNotice(null);
              }}
            >
              ← Use a different email
            </button>
            <button type="submit" disabled={busy || otp.length < 6} className="gci-primary">
              {busy ? "Verifying…" : "Sign in"}
            </button>
          </div>
        </form>
      )}
    </main>
  );
}
