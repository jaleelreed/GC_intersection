"use client";
// BidEasy first-run onboarding — a paneled, paginated pop-out modal walking the
// convergence loop. Auto-shows once (localStorage-gated by AppShell) and is
// re-openable from the Help control. Focus-trapped; closes on X / Escape / scrim.
import { useEffect, useRef, useState } from "react";
import { CloseIcon } from "../app/NavIcons";
import { useModalA11y } from "../app/useModalA11y";

const PANELS = [
  {
    title: "Welcome to BidEasy",
    body: "Turn a homeowner's three-minute form into a priced bid you can send in minutes. Here's the loop.",
  },
  {
    title: "Share your link",
    body: "Text it, embed it on your site, or print the QR. No setup, no rate library to build first.",
  },
  {
    title: "A priced draft appears",
    body: "Every submission comes back as an honest range — seeded from market data, with the drivers that move the number named.",
  },
  {
    title: "Edit to your prices",
    body: "Correct the draft to what you'd actually charge. Every edit teaches BidEasy your pricing, so the next draft starts closer.",
  },
  {
    title: "Send a clean bid",
    body: "Turn the draft into a bid your client can accept online. You're back on the truck, not at the desk at 11pm.",
  },
];

export function BidEasyOnboarding({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [step, setStep] = useState(0);
  const cardRef = useRef<HTMLDivElement>(null);
  useModalA11y(cardRef, open, onClose);

  // Always restart at the first panel when the modal is (re)opened.
  useEffect(() => {
    if (open) setStep(0);
  }, [open]);

  if (!open) return null;

  const last = step === PANELS.length - 1;
  const panel = PANELS[step];

  return (
    <div
      className="fixed inset-0 z-[60] grid place-items-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="bideasy-onb-title"
    >
      {/* Scrim */}
      <button
        type="button"
        aria-label="Close"
        tabIndex={-1}
        onClick={onClose}
        className="absolute inset-0 cursor-default bg-ink/50 backdrop-blur-sm"
      />

      <div ref={cardRef} tabIndex={-1} className="ui-card ui-rise relative w-full max-w-md p-6 outline-none sm:p-8">
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="ui-btn ui-btn-quiet absolute right-3 top-3 !h-9 !w-9 !p-0 rounded-full"
        >
          <CloseIcon className="h-5 w-5" />
        </button>

        <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-xl bg-accent text-lg font-bold text-accent-foreground">
          {step + 1}
        </div>

        <h2 id="bideasy-onb-title" className="font-display text-2xl font-bold">
          {panel.title}
        </h2>
        <p className="mt-2 text-muted">{panel.body}</p>

        {/* Progress dots */}
        <div className="mt-6 flex items-center gap-2" aria-hidden="true">
          {PANELS.map((_, i) => (
            <span
              key={i}
              className={[
                "h-1.5 rounded-full transition-all",
                i === step ? "w-6 bg-accent" : "w-1.5 bg-line",
              ].join(" ")}
            />
          ))}
        </div>

        <div className="mt-6 flex items-center justify-between gap-3">
          {step > 0 ? (
            <button type="button" className="ui-btn ui-btn-ghost" onClick={() => setStep((s) => s - 1)}>
              Back
            </button>
          ) : (
            <button type="button" className="ui-btn ui-btn-quiet" onClick={onClose}>
              Skip
            </button>
          )}

          <span className="text-sm text-faint">
            {step + 1} / {PANELS.length}
          </span>

          {last ? (
            <button type="button" className="ui-btn ui-btn-primary" onClick={onClose}>
              Get started
            </button>
          ) : (
            <button type="button" className="ui-btn ui-btn-primary" onClick={() => setStep((s) => s + 1)}>
              Next
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
