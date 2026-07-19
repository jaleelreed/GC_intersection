// Persistent workspace nav on every /app page. Redesigned: warm surface, a
// pill-style active-aware link row, workspace identity, theme toggle, sign out.
import Link from "next/link";
import { SignOutButton } from "./SignOutButton";
import { ThemeToggle } from "../ui/ThemeToggle";

const LINKS = [
  { href: "/app", label: "Leads" },
  { href: "/app/bids", label: "Bids" },
  { href: "/app/pricing", label: "Pricing" },
  { href: "/app/insights", label: "Insights" },
  { href: "/app/links", label: "Links" },
  { href: "/app/settings", label: "Settings" },
  { href: "/app/team", label: "Team" },
];

export function AppNav({ orgName, email }: { orgName: string; email: string }) {
  return (
    <nav
      aria-label="Workspace"
      className="sticky top-0 z-20 border-b border-line bg-bg/85 backdrop-blur-md"
    >
      <div className="mx-auto flex max-w-5xl flex-wrap items-center gap-x-5 gap-y-2 px-4 py-3">
        <Link href="/app" className="flex items-center gap-2 font-display text-lg font-bold text-ink">
          <span className="grid h-7 w-7 place-items-center rounded-lg bg-accent text-accent-foreground text-sm">
            {orgName.charAt(0).toUpperCase()}
          </span>
          <span className="max-w-[40vw] truncate">{orgName}</span>
        </Link>

        <div className="order-3 flex w-full items-center gap-1 overflow-x-auto md:order-none md:w-auto">
          {LINKS.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className="rounded-full px-3 py-1.5 text-sm font-semibold text-muted transition-colors hover:bg-accent-soft hover:text-ink"
            >
              {l.label}
            </Link>
          ))}
        </div>

        <div className="ml-auto flex items-center gap-2">
          <span className="hidden max-w-[26vw] truncate text-sm text-faint sm:inline" title={email}>
            {email}
          </span>
          <ThemeToggle />
          <SignOutButton />
        </div>
      </div>
    </nav>
  );
}
