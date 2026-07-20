// Single source of truth for the workspace nav. Same destinations as the old
// top bar; icons added for the collapsed rail. Grouped into two labeled
// sections (shown only when the nav is expanded).
import type { SVGProps } from "react";
import {
  LeadsIcon,
  BidsIcon,
  PricingIcon,
  InsightsIcon,
  LinksIcon,
  SettingsIcon,
  TeamIcon,
} from "./NavIcons";

export type NavItem = {
  href: string;
  label: string;
  Icon: (p: SVGProps<SVGSVGElement>) => React.ReactElement;
};

export type NavSection = { label: string; items: NavItem[] };

export const NAV_SECTIONS: NavSection[] = [
  {
    label: "Pipeline",
    items: [
      { href: "/app", label: "Leads", Icon: LeadsIcon },
      { href: "/app/bids", label: "Bids", Icon: BidsIcon },
      { href: "/app/pricing", label: "Pricing", Icon: PricingIcon },
    ],
  },
  {
    label: "Workspace",
    items: [
      { href: "/app/insights", label: "Insights", Icon: InsightsIcon },
      { href: "/app/links", label: "Links", Icon: LinksIcon },
      { href: "/app/settings", label: "Settings", Icon: SettingsIcon },
      { href: "/app/team", label: "Team", Icon: TeamIcon },
    ],
  },
];

// A lead-detail route (/app/lead/[id]) belongs to "Leads"; every other route
// starts with /app too, so "Leads" must match exactly (or the lead pages),
// while the rest match by path prefix.
export function isNavItemActive(href: string, pathname: string): boolean {
  if (href === "/app") return pathname === "/app" || pathname.startsWith("/app/lead");
  return pathname === href || pathname.startsWith(href + "/");
}
