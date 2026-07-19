// Terms of Service — plain-language, honest. Not legal advice; a real launch
// should have counsel review, but shipping *something* beats a dead link.
export const metadata = { title: "Terms of Service — GC_intersection" };

export default function Terms() {
  return (
    <main className="gci-page gci-legal">
      <p className="gci-back"><a href="/">← Home</a></p>
      <h1>Terms of Service</h1>
      <p className="gci-hint">Last updated 2026-07-19. Plain-language summary; not legal advice.</p>

      <h2>What this service does</h2>
      <p>
        GC_intersection helps general contractors produce draft estimates and send bids.
        Estimates are <strong>drafts and projections</strong>, seeded from market data and
        refined by you. They are not guarantees of final cost.
      </p>

      <h2>Your account</h2>
      <p>
        You are responsible for activity under your workspace and for the accuracy of the
        prices you set. Keep access to your email secure — it is how you sign in.
      </p>

      <h2>Your data</h2>
      <p>
        Your cost data and edits are yours. We do not pool your pricing with other contractors.
        You can export or delete your workspace data at any time from Settings.
      </p>

      <h2>Estimates and bids are not contracts</h2>
      <p>
        A bid sent through the platform records a price and scope for the parties&rsquo;
        convenience. It is not a construction contract and creates no obligation to perform
        until the parties execute a separate written agreement.
      </p>

      <h2>No warranty</h2>
      <p>
        The service is provided &ldquo;as is.&rdquo; We work to keep it accurate and available
        but do not warrant that draft numbers are correct for your job — your professional
        judgment governs.
      </p>

      <h2>Contact</h2>
      <p>Questions about these terms: the workspace owner&rsquo;s account contact.</p>
    </main>
  );
}
