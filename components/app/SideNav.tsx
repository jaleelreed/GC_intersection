"use client";
// Presentational nav body (the landmark + item list). Rendered twice by
// AppShell: as the desktop sidebar (collapsed toggles the icon rail) and inside
// the mobile drawer (always expanded, closes on navigate). Active state and
// tooltips are derived here; all shared state lives in AppShell.
import Link from "next/link";
import { usePathname } from "next/navigation";
import { NAV_SECTIONS, isNavItemActive } from "./navItems";

export function SideNav({
  collapsed,
  onNavigate,
}: {
  collapsed: boolean;
  onNavigate?: () => void;
}) {
  const pathname = usePathname() ?? "/app";

  return (
    <nav aria-label="Primary" className="flex flex-col gap-1 p-3">
      {NAV_SECTIONS.map((section, si) => (
        <div key={section.label} className="flex flex-col gap-1">
          {collapsed ? (
            si > 0 && <div className="mx-2 my-2 border-t border-line" />
          ) : (
            <div className="px-3 pb-1 pt-3 text-xs font-semibold uppercase tracking-wide text-faint">
              {section.label}
            </div>
          )}

          {section.items.map((item) => {
            const active = isNavItemActive(item.href, pathname);
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={onNavigate}
                aria-current={active ? "page" : undefined}
                className={[
                  "group relative flex items-center gap-3 rounded-full px-3 py-2 text-sm font-semibold transition-colors",
                  collapsed ? "justify-center" : "",
                  active
                    ? "bg-accent-soft text-accent"
                    : "text-muted hover:bg-accent-soft hover:text-ink",
                ].join(" ")}
              >
                <item.Icon className="h-5 w-5 shrink-0" />
                <span className={collapsed ? "sr-only" : "truncate"}>{item.label}</span>

                {/* Collapsed rail: an accessible CSS tooltip for sighted users
                    (the label above stays in the DOM as the link's name). */}
                {collapsed && (
                  <span
                    role="tooltip"
                    className="pointer-events-none absolute left-full z-50 ml-2 whitespace-nowrap rounded-md bg-ink px-2 py-1 text-xs font-medium text-[color:var(--bg)] opacity-0 shadow-lift transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100"
                  >
                    {item.label}
                  </span>
                )}
              </Link>
            );
          })}
        </div>
      ))}
    </nav>
  );
}
