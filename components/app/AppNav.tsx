// Persistent workspace nav on every /app page. Server-rendered chrome +
// a client sign-out. Mobile-first: workspace name, a Leads home link, and
// the account/sign-out on the right.
import Link from "next/link";
import { SignOutButton } from "./SignOutButton";

export function AppNav({ orgName, email }: { orgName: string; email: string }) {
  return (
    <nav className="gci-nav-bar" aria-label="Workspace">
      <Link href="/app" className="gci-nav-brand">
        {orgName}
      </Link>
      <div className="gci-nav-links">
        <Link href="/app" className="gci-navlink">
          Leads
        </Link>
        <Link href="/app/bids" className="gci-navlink">
          Bids
        </Link>
        <Link href="/app/links" className="gci-navlink">
          Links
        </Link>
        <Link href="/app/insights" className="gci-navlink">
          Insights
        </Link>
        <Link href="/app/settings" className="gci-navlink">
          Settings
        </Link>
        <Link href="/app/team" className="gci-navlink">
          Team
        </Link>
        <span className="gci-nav-email" title={email}>
          {email}
        </span>
        <SignOutButton />
      </div>
    </nav>
  );
}
