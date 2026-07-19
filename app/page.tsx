// Public landing page — the front door. Explains the product and routes GCs
// to sign in. No auth required.
import Link from "next/link";

export const metadata = {
  title: "GC_intersection — estimates that price themselves",
  description:
    "Zero-setup estimating for residential-renovation GCs. A homeowner fills your form; a priced draft lands in your inbox. Your edits teach it your pricing.",
};

export default function Landing() {
  return (
    <main className="gci-landing">
      <header className="gci-landing-nav">
        <span className="gci-landing-brand">GC_intersection</span>
        <Link href="/auth/sign-in" className="gci-landing-signin">
          Sign in
        </Link>
      </header>

      <section className="gci-hero">
        <h1>Estimates that price themselves.</h1>
        <p className="gci-hero-sub">
          Share one link. A homeowner fills a 3-minute form, and a priced draft estimate —
          a real range with the swing drivers named — lands in your inbox. No library to
          build, no software to set up. Your edits teach it your pricing, so the next draft
          starts closer.
        </p>
        <div className="gci-hero-cta">
          <Link href="/auth/sign-in" className="gci-primary">
            Get started free
          </Link>
          <span className="gci-hint">No credit card. Sign in with your email.</span>
        </div>
      </section>

      <section className="gci-how">
        <h2>How it works</h2>
        <ol>
          <li>
            <strong>Share your link.</strong> Text it, embed it on your site, or print the QR.
          </li>
          <li>
            <strong>A homeowner submits.</strong> Address, scope, condition, finish — 3 minutes.
          </li>
          <li>
            <strong>A priced draft appears.</strong> Seeded from county market data, shown as a
            range with the drivers that move it.
          </li>
          <li>
            <strong>You edit and send.</strong> Correct it to your prices; send a clean bid the
            homeowner can accept. Every edit makes the next draft sharper.
          </li>
        </ol>
      </section>

      <section className="gci-why">
        <h2>Built for the way you actually work</h2>
        <ul>
          <li><strong>Zero setup.</strong> Value on the first bid, before any data exists.</li>
          <li><strong>Your prices stay yours.</strong> Learned only from your jobs, never pooled.</li>
          <li><strong>Honest ranges.</strong> Unknowns widen the number — never a false-precise guess.</li>
          <li><strong>Phone-first.</strong> Built to use from the truck, not a desk.</li>
        </ul>
      </section>

      <footer className="gci-landing-foot">
        <Link href="/auth/sign-in">Sign in</Link>
        <span>·</span>
        <Link href="/legal/terms">Terms</Link>
        <span>·</span>
        <Link href="/legal/privacy">Privacy</Link>
        <span className="gci-hint">© GC_intersection</span>
      </footer>
    </main>
  );
}
