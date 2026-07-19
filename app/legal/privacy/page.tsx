// Privacy Policy — plain-language. Not legal advice.
export const metadata = { title: "Privacy Policy — GC_intersection" };

export default function Privacy() {
  return (
    <main className="gci-page gci-legal">
      <p className="gci-back"><a href="/">← Home</a></p>
      <h1>Privacy Policy</h1>
      <p className="gci-hint">Last updated 2026-07-19. Plain-language summary; not legal advice.</p>

      <h2>What we collect</h2>
      <ul>
        <li><strong>Account:</strong> your email and name, to sign you in and identify your workspace.</li>
        <li><strong>Homeowner submissions:</strong> the intake details a homeowner enters for you (address, scope, contact) so you can bid the job.</li>
        <li><strong>Your edits:</strong> the prices you set, used to improve your own future drafts.</li>
      </ul>

      <h2>How we use it</h2>
      <p>
        To run the estimating workflow for your workspace. <strong>Your cost data is never
        pooled with other contractors</strong> and is not sold. Learned pricing improves only
        your own drafts.
      </p>

      <h2>Sharing</h2>
      <p>
        A bid is shared only with the recipient you send it to, via a private link. We use
        infrastructure providers (hosting, database, email delivery) to operate the service;
        they process data on our behalf.
      </p>

      <h2>Your controls</h2>
      <p>
        You can export your workspace data or delete your workspace from Settings. Deleting a
        workspace removes its projects, estimates, and learned pricing.
      </p>

      <h2>Contact</h2>
      <p>Privacy questions: the workspace owner&rsquo;s account contact.</p>
    </main>
  );
}
