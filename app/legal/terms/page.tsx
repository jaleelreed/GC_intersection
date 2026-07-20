// Terms of Service — plain-language, honest. Not legal advice; a real launch
// should have counsel review, but shipping *something* beats a dead link.
export const metadata = { title: "Terms of Service — GC_intersection" };

export default function Terms() {
  return (
    <main className="ui-rise mx-auto max-w-3xl px-5 py-10">
      <p className="mb-4 text-sm"><a href="/" className="text-muted hover:text-ink">← Home</a></p>
      <h1 className="font-display text-3xl font-bold text-ink">Terms of Service</h1>
      <div className="mt-3 rounded-xl border border-line p-4 text-sm text-muted">Last updated 2026-07-19. Plain-language summary; not legal advice.</div>

      <h2 className="mt-8 font-display text-xl font-bold text-ink">What this service does</h2>
      <p className="mt-2 leading-relaxed text-muted">
        GC_intersection helps general contractors produce draft estimates and send bids.
        Estimates are <strong className="text-ink">drafts and projections</strong>, seeded from market data and
        refined by you. They are not guarantees of final cost.
      </p>

      <h2 className="mt-8 font-display text-xl font-bold text-ink">Your account</h2>
      <p className="mt-2 leading-relaxed text-muted">
        You are responsible for activity under your workspace and for the accuracy of the
        prices you set. Keep access to your email secure — it is how you sign in.
      </p>

      <h2 className="mt-8 font-display text-xl font-bold text-ink">Your data</h2>
      <p className="mt-2 leading-relaxed text-muted">
        Your cost data and edits are yours. We do not pool your pricing with other contractors.
        You can export or delete your workspace data at any time from Settings.
      </p>

      <h2 className="mt-8 font-display text-xl font-bold text-ink">Estimates and bids are not contracts</h2>
      <p className="mt-2 leading-relaxed text-muted">
        A bid sent through the platform records a price and scope for the parties&rsquo;
        convenience. It is not a construction contract and creates no obligation to perform
        until the parties execute a separate written agreement.
      </p>

      <h2 className="mt-8 font-display text-xl font-bold text-ink">No warranty</h2>
      <p className="mt-2 leading-relaxed text-muted">
        The service is provided &ldquo;as is.&rdquo; We work to keep it accurate and available
        but do not warrant that draft numbers are correct for your job — your professional
        judgment governs.
      </p>

      <h2 className="mt-8 font-display text-xl font-bold text-ink">Contact</h2>
      <p className="mt-2 leading-relaxed text-muted">Questions about these terms: the workspace owner&rsquo;s account contact.</p>
    </main>
  );
}
