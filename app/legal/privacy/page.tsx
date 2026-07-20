// Privacy Policy — plain-language. Not legal advice.
export const metadata = { title: "Privacy Policy — GC_intersection" };

export default function Privacy() {
  return (
    <main className="ui-rise mx-auto max-w-3xl px-5 py-10">
      <p className="mb-4 text-sm"><a href="/" className="text-muted hover:text-ink">← Home</a></p>
      <h1 className="font-display text-3xl font-bold text-ink">Privacy Policy</h1>
      <div className="mt-3 rounded-xl border border-line p-4 text-sm text-muted">Last updated 2026-07-19. Plain-language summary; not legal advice.</div>

      <h2 className="mt-8 font-display text-xl font-bold text-ink">What we collect</h2>
      <ul className="mt-2 list-disc space-y-1 pl-5 text-muted">
        <li><strong className="text-ink">Account:</strong> your email and name, to sign you in and identify your workspace.</li>
        <li><strong className="text-ink">Homeowner submissions:</strong> the intake details a homeowner enters for you (address, scope, contact) so you can bid the job.</li>
        <li><strong className="text-ink">Your edits:</strong> the prices you set, used to improve your own future drafts.</li>
      </ul>

      <h2 className="mt-8 font-display text-xl font-bold text-ink">How we use it</h2>
      <p className="mt-2 leading-relaxed text-muted">
        To run the estimating workflow for your workspace. <strong className="text-ink">Your cost data is never
        pooled with other contractors</strong> and is not sold. Learned pricing improves only
        your own drafts.
      </p>

      <h2 className="mt-8 font-display text-xl font-bold text-ink">Sharing</h2>
      <p className="mt-2 leading-relaxed text-muted">
        A bid is shared only with the recipient you send it to, via a private link. We use
        infrastructure providers (hosting, database, email delivery) to operate the service;
        they process data on our behalf.
      </p>

      <h2 className="mt-8 font-display text-xl font-bold text-ink">Your controls</h2>
      <p className="mt-2 leading-relaxed text-muted">
        You can export your workspace data or delete your workspace from Settings. Deleting a
        workspace removes its projects, estimates, and learned pricing.
      </p>

      <h2 className="mt-8 font-display text-xl font-bold text-ink">Contact</h2>
      <p className="mt-2 leading-relaxed text-muted">Privacy questions: the workspace owner&rsquo;s account contact.</p>
    </main>
  );
}
