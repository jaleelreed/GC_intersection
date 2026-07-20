"use client";
// The authed workspace shell. Owns ALL shared client state — the Gmail-style
// side nav (expanded / hover-peek / mobile drawer) and the BidEasy onboarding
// modal — and renders the top bar, sidebar, drawer, and modal around the
// server-rendered page ({children}).
import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ThemeToggle } from "../ui/ThemeToggle";
import { SignOutButton } from "./SignOutButton";
import { SideNav } from "./SideNav";
import { BidEasyOnboarding } from "../onboarding/BidEasyOnboarding";
import { useModalA11y } from "./useModalA11y";
import { MenuIcon, CloseIcon, HelpIcon } from "./NavIcons";

export function AppShell({
  orgName,
  email,
  children,
}: {
  orgName: string;
  email: string;
  children: ReactNode;
}) {
  // Expanded/collapsed preference. Initialized from the pre-paint <html
  // data-nav> script (falls back to localStorage) to avoid a width flash.
  const [expanded, setExpanded] = useState<boolean>(() => {
    if (typeof document === "undefined") return true;
    const d = document.documentElement.dataset.nav;
    if (d) return d !== "collapsed";
    try {
      return localStorage.getItem("nav") !== "collapsed";
    } catch {
      return true;
    }
  });
  const [peeking, setPeeking] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [onboardingOpen, setOnboardingOpen] = useState(false);
  const [isDesktop, setIsDesktop] = useState(true);
  const pathname = usePathname();

  const enterTimer = useRef<number | undefined>(undefined);
  const leaveTimer = useRef<number | undefined>(undefined);
  const drawerRef = useRef<HTMLDivElement>(null);

  // Track the desktop/mobile boundary (matches the nav's md: layout switch).
  useEffect(() => {
    const mq = window.matchMedia("(min-width: 768px)");
    const update = () => setIsDesktop(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);

  // First-run: auto-open the onboarding once, on the dashboard only (never
  // hijack a deep link into a lead/bid), then never nag.
  useEffect(() => {
    if (pathname !== "/app") return;
    try {
      if (localStorage.getItem("bideasy_onboarding") !== "seen") setOnboardingOpen(true);
    } catch {
      /* ignore */
    }
  }, [pathname]);

  // Peeking is only meaningful while collapsed.
  useEffect(() => {
    if (expanded) setPeeking(false);
  }, [expanded]);

  const closeDrawer = () => setMobileOpen(false);
  useModalA11y(drawerRef, mobileOpen, closeDrawer);

  function persistExpanded(next: boolean) {
    setExpanded(next);
    try {
      localStorage.setItem("nav", next ? "expanded" : "collapsed");
      document.documentElement.dataset.nav = next ? "expanded" : "collapsed";
    } catch {
      /* ignore */
    }
  }

  function onToggle() {
    if (isDesktop) persistExpanded(!expanded);
    else setMobileOpen((o) => !o);
  }

  function onPeekEnter() {
    if (expanded) return;
    window.clearTimeout(leaveTimer.current);
    enterTimer.current = window.setTimeout(() => setPeeking(true), 150);
  }
  function onPeekLeave() {
    window.clearTimeout(enterTimer.current);
    leaveTimer.current = window.setTimeout(() => setPeeking(false), 150);
  }

  function closeOnboarding() {
    setOnboardingOpen(false);
    try {
      localStorage.setItem("bideasy_onboarding", "seen");
    } catch {
      /* ignore */
    }
  }

  const railCollapsed = !(expanded || peeking);
  const avatar = orgName.charAt(0).toUpperCase();

  return (
    <div className="flex min-h-dvh flex-col bg-bg text-ink">
      {/* Top bar */}
      <header className="sticky top-0 z-40 flex h-14 items-center gap-2 border-b border-line bg-bg/85 px-3 backdrop-blur-md sm:px-4">
        <button
          type="button"
          onClick={onToggle}
          aria-label="Toggle navigation"
          aria-expanded={isDesktop ? expanded : mobileOpen}
          aria-controls="primary-nav primary-drawer"
          className="ui-btn ui-btn-ghost !h-9 !w-9 !p-0 rounded-full"
        >
          <MenuIcon className="h-5 w-5" />
        </button>

        <Link href="/app" className="flex items-center gap-2 font-display text-base font-bold text-ink">
          <span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-accent text-sm text-accent-foreground">
            {avatar}
          </span>
          <span className="max-w-[40vw] truncate">{orgName}</span>
        </Link>

        <div className="ml-auto flex items-center gap-1 sm:gap-2">
          <span className="hidden max-w-[22vw] truncate text-sm text-faint lg:inline" title={email}>
            {email}
          </span>
          <button
            type="button"
            onClick={() => setOnboardingOpen(true)}
            aria-label="How BidEasy works"
            className="ui-btn ui-btn-ghost !h-9 !w-9 !p-0 rounded-full"
          >
            <HelpIcon className="h-5 w-5" />
          </button>
          <ThemeToggle />
          <SignOutButton />
        </div>
      </header>

      <div className="flex flex-1">
        {/* Desktop sidebar: the spacer takes layout width; the sticky panel
            widens on hover-peek as an overlay so content does not reflow. */}
        <div
          className={`relative hidden shrink-0 transition-[width] duration-200 md:block ${
            expanded ? "w-64" : "w-[72px]"
          }`}
          suppressHydrationWarning
        >
          <div
            id="primary-nav"
            onMouseEnter={onPeekEnter}
            onMouseLeave={onPeekLeave}
            className={`sticky top-14 h-[calc(100dvh-3.5rem)] overflow-y-auto overflow-x-hidden border-r border-line bg-surface transition-[width] duration-200 ${
              expanded || peeking ? "w-64" : "w-[72px]"
            } ${peeking && !expanded ? "z-30 shadow-lift" : ""}`}
          >
            <SideNav collapsed={railCollapsed} />
          </div>
        </div>

        <main className="min-w-0 flex-1">{children}</main>
      </div>

      {/* Mobile drawer + scrim (always in DOM below md; slid off-screen when closed) */}
      <button
        type="button"
        aria-label="Close navigation"
        tabIndex={mobileOpen ? 0 : -1}
        onClick={closeDrawer}
        className={`fixed inset-0 z-50 cursor-default bg-ink/40 transition-opacity duration-200 md:hidden ${
          mobileOpen ? "opacity-100" : "pointer-events-none opacity-0"
        }`}
      />
      <div
        id="primary-drawer"
        ref={drawerRef}
        aria-hidden={!mobileOpen}
        className={`fixed inset-y-0 left-0 z-50 flex w-72 max-w-[85vw] flex-col overflow-y-auto bg-surface shadow-lift transition-transform duration-200 md:hidden ${
          mobileOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="flex h-14 items-center justify-between border-b border-line px-4">
          <span className="font-display text-base font-bold">{orgName}</span>
          <button
            type="button"
            onClick={closeDrawer}
            aria-label="Close navigation"
            className="ui-btn ui-btn-quiet !h-9 !w-9 !p-0 rounded-full"
          >
            <CloseIcon className="h-5 w-5" />
          </button>
        </div>
        <SideNav collapsed={false} onNavigate={closeDrawer} />
      </div>

      <BidEasyOnboarding open={onboardingOpen} onClose={closeOnboarding} />
    </div>
  );
}
