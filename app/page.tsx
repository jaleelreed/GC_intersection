// Public landing page — the front door, redesigned to the new design system.
import Link from "next/link";
import { ThemeToggle } from "../components/ui/ThemeToggle";

export const metadata = {
  title: "GC_intersection — estimates that price themselves",
  description:
    "Zero-setup estimating for residential-renovation GCs. A homeowner fills your form; a priced draft lands in your inbox. Your edits teach it your pricing.",
};

const STEPS = [
  { n: "01", t: "Share your link", d: "Text it, embed it on your site, or print the QR. No setup, no library to build." },
  { n: "02", t: "A homeowner submits", d: "Address, scope, condition, finish, photos — about three minutes." },
  { n: "03", t: "A priced draft appears", d: "Seeded from county market data, shown as an honest range with the drivers that move it." },
  { n: "04", t: "You edit and send", d: "Correct it to your prices; send a clean bid they can accept. Every edit sharpens the next one." },
];

const WHY = [
  { t: "Zero setup", d: "Value on the very first bid, before any data exists." },
  { t: "Your prices stay yours", d: "Learned only from your jobs. Never pooled with other contractors." },
  { t: "Honest ranges", d: "Unknowns widen the number — never a false-precise guess." },
  { t: "Built for the truck", d: "Fast and legible on a phone, not just a desk." },
];

export default function Landing() {
  return (
    <div className="min-h-dvh bg-bg text-ink">
      <header className="mx-auto flex max-w-5xl items-center justify-between px-5 py-5">
        <span className="flex items-center gap-2 font-display text-lg font-bold">
          <span className="grid h-7 w-7 place-items-center rounded-lg bg-accent text-accent-foreground text-sm">G</span>
          GC_intersection
        </span>
        <div className="flex items-center gap-2">
          <ThemeToggle />
          <Link href="/auth/sign-in" className="ui-btn ui-btn-ghost text-sm">Sign in</Link>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-5">
        {/* Hero */}
        <section className="ui-rise py-14 sm:py-20">
          <span className="ui-chip mb-5">For residential-renovation GCs</span>
          <h1 className="max-w-3xl text-5xl font-extrabold leading-[1.05] sm:text-6xl">
            Estimates that <span className="text-accent">price themselves.</span>
          </h1>
          <p className="mt-6 max-w-xl text-lg leading-relaxed text-muted">
            Share one link. A homeowner fills a three-minute form, and a priced draft
            estimate — a real range with the swing drivers named — lands in your inbox.
            No library to build, no software to set up. Your edits teach it your pricing,
            so the next draft starts closer.
          </p>
          <div className="mt-8 flex flex-wrap items-center gap-4">
            <Link href="/auth/sign-in" className="ui-btn ui-btn-primary !h-12 px-7 text-base">
              Get started free →
            </Link>
            <span className="text-sm text-faint">No credit card. Sign in with your email.</span>
          </div>
        </section>

        {/* How it works */}
        <section className="py-8">
          <h2 className="text-2xl font-bold">How it works</h2>
          <div className="mt-6 grid gap-4 sm:grid-cols-2">
            {STEPS.map((s) => (
              <div key={s.n} className="ui-card p-6">
                <div className="font-display text-3xl font-bold text-accent">{s.n}</div>
                <div className="mt-2 text-lg font-bold">{s.t}</div>
                <p className="mt-1 text-muted">{s.d}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Why */}
        <section className="py-12">
          <h2 className="text-2xl font-bold">Built for the way you actually work</h2>
          <div className="mt-6 grid gap-3 sm:grid-cols-2">
            {WHY.map((w) => (
              <div key={w.t} className="flex gap-3 rounded-xl border border-line bg-surface p-4">
                <span className="mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full bg-accent-soft text-accent">✓</span>
                <div>
                  <div className="font-semibold">{w.t}</div>
                  <div className="text-sm text-muted">{w.d}</div>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* CTA band */}
        <section className="my-8 overflow-hidden rounded-2xl bg-ink px-8 py-12 text-center" style={{ color: "var(--bg)" }}>
          <h2 className="font-display text-3xl font-bold" style={{ color: "var(--bg)" }}>Take your next lead in three minutes.</h2>
          <p className="mx-auto mt-2 max-w-md opacity-80">Your first priced draft is waiting on the other side of a sign-in.</p>
          <Link href="/auth/sign-in" className="ui-btn ui-btn-primary mt-6 !h-12 px-7 text-base">Get started free →</Link>
        </section>
      </main>

      <footer className="mx-auto flex max-w-5xl flex-wrap items-center gap-4 border-t border-line px-5 py-8 text-sm text-muted">
        <Link href="/auth/sign-in" className="hover:text-ink">Sign in</Link>
        <Link href="/legal/terms" className="hover:text-ink">Terms</Link>
        <Link href="/legal/privacy" className="hover:text-ink">Privacy</Link>
        <span className="ml-auto text-faint">© GC_intersection</span>
      </footer>
    </div>
  );
}
