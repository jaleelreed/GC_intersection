"use client";
// US-005/US-006: the ONE intake form component. Two skins (variant) — the
// field set is identical by construction; tests assert it stays that way.
// All steps render in the DOM (hidden when inactive) so the contract is
// visible to static analysis and the parity test.
import { useEffect, useMemo, useRef, useState } from "react";
import { PhotoUpload, type Photo } from "./PhotoUpload";

export const SCOPE_TOGGLES: { key: string; label: string }[] = [
  { key: "bath", label: "Bathroom" },
  { key: "kitchen", label: "Kitchen" },
  { key: "floors", label: "Flooring" },
  { key: "walls", label: "Walls & paint" },
  { key: "utilities", label: "Utilities" },
  { key: "plumbing", label: "Plumbing" },
  { key: "electric", label: "Electrical" },
  { key: "mechanical", label: "Heating & cooling" },
  { key: "roof", label: "Roof" },
  { key: "basement", label: "Basement" },
];

const SCOPE_CLASSES = [
  { key: "in_place", label: "Keep the layout" },
  { key: "reconfigure", label: "Move things around" },
  { key: "relocate", label: "Relocate it entirely" },
] as const;

const KNOWN_PROBLEMS = [
  { key: "water_damage", label: "Water damage" },
  { key: "foundation_cracks", label: "Foundation cracks" },
  { key: "knob_tube_wiring", label: "Old (knob & tube) wiring" },
  { key: "galvanized_plumbing", label: "Old galvanized plumbing" },
  { key: "asbestos_suspected", label: "Possible asbestos" },
  { key: "roof_leak", label: "Roof leak" },
  { key: "pest_damage", label: "Pest damage" },
  { key: "none", label: "None that I know of" },
];

const STRUCTURAL_FLAGS = [
  { key: "walls_removed", label: "Removing walls" },
  { key: "addition", label: "Building an addition" },
  { key: "foundation_work", label: "Foundation work" },
  { key: "roof_structure", label: "Roof structure changes" },
];

type ToggleState = { on: boolean; class: string | null };

const SKIP_COPY = "Skipping is fine — we’ll price a wider range.";

export function IntakeForm({ slug, variant }: { slug: string; variant: "link" | "embed" }) {
  const [step, setStep] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [errors, setErrors] = useState<{ path: string; message: string }[]>([]);
  const startedAt = useRef<number>(Date.now());

  const [contact, setContact] = useState({ contact_name: "", contact_email: "", contact_phone: "" });
  const [address, setAddress] = useState({ address_line1: "", address_line2: "", city: "", state: "", postal_code: "" });
  const [sqft, setSqft] = useState("");
  const [existing, setExisting] = useState({ beds: "", full_baths: "", half_baths: "" });
  const [target, setTarget] = useState({ beds: "", full_baths: "", half_baths: "" });
  const [conditions, setConditions] = useState({ year_built: "", occupied: "", access: "" });
  const [problems, setProblems] = useState<string[]>([]);
  const [toggles, setToggles] = useState<Record<string, ToggleState>>(
    Object.fromEntries(SCOPE_TOGGLES.map((t) => [t.key, { on: false, class: null }]))
  );
  const [structural, setStructural] = useState<Record<string, boolean>>({});
  const [tier, setTier] = useState("");
  const [narrative, setNarrative] = useState("");
  const [photos, setPhotos] = useState<Photo[]>([]);

  // Embed skin reports its height to the host page (public/embed.js).
  useEffect(() => {
    if (variant !== "embed" || typeof window === "undefined") return;
    const post = () =>
      window.parent?.postMessage(
        { type: "gci:height", height: document.documentElement.scrollHeight },
        "*"
      );
    post();
    const obs = new ResizeObserver(post);
    obs.observe(document.body);
    return () => obs.disconnect();
  }, [variant, step, done]);

  const payload = useMemo(() => {
    const num = (s: string) => (s.trim() === "" ? null : Number(s));
    return {
      ...contact,
      contact_phone: contact.contact_phone.trim() || null,
      ...address,
      address_line2: address.address_line2.trim() || null,
      square_footage: sqft.trim() === "" ? undefined : Number(sqft),
      existing_config: { beds: num(existing.beds), full_baths: num(existing.full_baths), half_baths: num(existing.half_baths) },
      target_config: { beds: num(target.beds), full_baths: num(target.full_baths), half_baths: num(target.half_baths) },
      conditions: {
        year_built: num(conditions.year_built),
        occupied: conditions.occupied === "" ? null : conditions.occupied === "yes",
        access: conditions.access || null,
        known_problems: problems,
      },
      scope_toggles: toggles,
      structural_flags: Object.fromEntries(
        STRUCTURAL_FLAGS.map((f) => [f.key, f.key in structural ? structural[f.key] : null])
      ),
      finish_tier: tier || null,
      narrative: narrative.trim() || null,
      photos: photos.map((p) => ({ content_type: p.content_type, data_base64: p.data_base64 })),
      form_started_at: startedAt.current,
    };
  }, [contact, address, sqft, existing, target, conditions, problems, toggles, structural, tier, narrative]);

  async function submit() {
    setSubmitting(true);
    setErrors([]);
    try {
      const res = await fetch(`/api/intake/${slug}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (res.status === 201) {
        setDone(true);
      } else {
        const data = await res.json().catch(() => ({ errors: [] }));
        setErrors(
          data.errors?.length
            ? data.errors
            : [{ path: "", message: "Something went wrong. Your answers are saved here — try again." }]
        );
      }
    } catch {
      setErrors([{ path: "", message: "Network problem. Nothing was lost — try again." }]);
    } finally {
      setSubmitting(false);
    }
  }

  if (done) {
    return (
      <div className="ui-card ui-rise mx-auto max-w-2xl p-8 text-center" data-state="done">
        <h2 className="font-display text-2xl font-bold text-ink">Sent.</h2>
        <p className="mt-2 text-muted">
          They&rsquo;ll reach out at <strong className="text-ink">{contact.contact_email}</strong>.
        </p>
      </div>
    );
  }

  const steps = ["About you", "The work", "The place", "In your words"];

  return (
    <form
      className="ui-card ui-rise mx-auto max-w-2xl p-6 sm:p-8"
      onSubmit={(e) => {
        e.preventDefault();
        if (step < 3) setStep(step + 1);
        else void submit();
      }}
    >
      <ol className="mb-7 flex items-start gap-2" aria-label="progress">
        {steps.map((s, i) => (
          <li key={s} aria-current={i === step ? "step" : undefined} className="flex flex-1 flex-col gap-1.5">
            <span className={`h-1.5 rounded-full transition-colors ${i <= step ? "bg-accent" : "bg-line"}`} />
            <span className={`text-xs font-semibold ${i === step ? "text-accent" : "text-faint"}`}>{s}</span>
          </li>
        ))}
      </ol>

      {errors.length > 0 && (
        <div className="mb-5 rounded-xl border border-danger bg-danger/10 p-3 text-sm text-danger" role="alert">
          {errors.map((e, i) => (
            <p key={i}>{e.path ? `${e.path}: ` : ""}{e.message}</p>
          ))}
        </div>
      )}

      {/* Honeypot — hidden from humans, tempting to bots. */}
      <div className="hp-wrap" aria-hidden="true">
        <label>
          Website
          <input name="website" tabIndex={-1} autoComplete="off" />
        </label>
      </div>

      <section hidden={step !== 0} className="space-y-4">
        <label data-field="contact_name" className="block">
          <span className="ui-label">Your name</span>
          <input className="ui-input" required={step === 0} value={contact.contact_name} onChange={(e) => setContact({ ...contact, contact_name: e.target.value })} />
        </label>
        <label data-field="contact_email" className="block">
          <span className="ui-label">Email</span>
          <input className="ui-input" type="email" required={step === 0} value={contact.contact_email} onChange={(e) => setContact({ ...contact, contact_email: e.target.value })} />
        </label>
        <label data-field="contact_phone" className="block">
          <span className="ui-label">Phone <span className="font-normal text-faint">(optional)</span></span>
          <input className="ui-input" type="tel" value={contact.contact_phone} onChange={(e) => setContact({ ...contact, contact_phone: e.target.value })} />
        </label>
        <label data-field="address_line1" className="block">
          <span className="ui-label">Project address</span>
          <input className="ui-input" required={step === 0} value={address.address_line1} onChange={(e) => setAddress({ ...address, address_line1: e.target.value })} />
        </label>
        <label data-field="address_line2" className="block">
          <span className="ui-label">Apt / unit <span className="font-normal text-faint">(optional)</span></span>
          <input className="ui-input" value={address.address_line2} onChange={(e) => setAddress({ ...address, address_line2: e.target.value })} />
        </label>
        <div className="grid grid-cols-3 gap-3">
          <label data-field="city" className="block">
            <span className="ui-label">City</span>
            <input className="ui-input" required={step === 0} value={address.city} onChange={(e) => setAddress({ ...address, city: e.target.value })} />
          </label>
          <label data-field="state" className="block">
            <span className="ui-label">State</span>
            <input className="ui-input" required={step === 0} maxLength={2} value={address.state} onChange={(e) => setAddress({ ...address, state: e.target.value })} />
          </label>
          <label data-field="postal_code" className="block">
            <span className="ui-label">Zip</span>
            <input className="ui-input" required={step === 0} value={address.postal_code} onChange={(e) => setAddress({ ...address, postal_code: e.target.value })} />
          </label>
        </div>
      </section>

      <section hidden={step !== 1} className="space-y-6">
        <div>
          <p className="mb-2 text-sm text-muted">Tap everything this project touches.</p>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {SCOPE_TOGGLES.map((t) => {
              const st = toggles[t.key];
              return (
                <div key={t.key} data-toggle={t.key} data-field={`toggle_${t.key}`} className={st.on ? "col-span-2 sm:col-span-3" : ""}>
                  <button
                    type="button"
                    aria-pressed={st.on}
                    onClick={() => setToggles({ ...toggles, [t.key]: { on: !st.on, class: null } })}
                    className={`w-full rounded-xl border px-3 py-2.5 text-sm font-semibold transition-colors ${st.on ? "border-accent bg-accent text-accent-foreground" : "border-line bg-surface text-ink hover:border-faint"}`}
                  >
                    {t.label}
                  </button>
                  {st.on && (
                    <div className="mt-2 flex flex-wrap gap-1.5" role="group" aria-label={`${t.label} scope`}>
                      {SCOPE_CLASSES.map((c) => (
                        <button
                          key={c.key}
                          type="button"
                          className={`rounded-lg border px-2.5 py-1 text-xs font-medium transition-colors ${st.class === c.key ? "border-accent bg-accent-soft text-accent" : "border-line bg-surface text-muted hover:border-faint"}`}
                          onClick={() => setToggles({ ...toggles, [t.key]: { on: true, class: c.key } })}
                        >
                          {c.label}
                        </button>
                      ))}
                      <button
                        type="button"
                        className={`rounded-lg border px-2.5 py-1 text-xs font-medium transition-colors ${st.class === null ? "border-accent bg-accent-soft text-accent" : "border-line bg-surface text-muted hover:border-faint"}`}
                        onClick={() => setToggles({ ...toggles, [t.key]: { on: true, class: null } })}
                      >
                        Not sure
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
        <fieldset data-field="structural_flags" className="border-0 p-0">
          <legend className="ui-label">Any of these?</legend>
          <div className="grid gap-2 sm:grid-cols-2">
            {STRUCTURAL_FLAGS.map((f) => (
              <label key={f.key} className="flex cursor-pointer items-center gap-2.5 rounded-lg border border-line bg-surface px-3 py-2 text-sm transition-colors hover:border-faint has-[:checked]:border-accent has-[:checked]:bg-accent-soft">
                <input
                  type="checkbox"
                  className="accent-[var(--accent)]"
                  checked={structural[f.key] ?? false}
                  onChange={(e) => setStructural({ ...structural, [f.key]: e.target.checked })}
                />
                {f.label}
              </label>
            ))}
          </div>
        </fieldset>
        <fieldset data-field="finish_tier" className="border-0 p-0">
          <legend className="ui-label">Finish level</legend>
          <div className="grid gap-2 sm:grid-cols-3">
            {[
              { key: "economy", label: "Keep it simple" },
              { key: "mid", label: "Solid mid-grade" },
              { key: "custom", label: "High-end / custom" },
            ].map((t) => (
              <label key={t.key} className="flex cursor-pointer items-center gap-2.5 rounded-lg border border-line bg-surface px-3 py-2 text-sm transition-colors hover:border-faint has-[:checked]:border-accent has-[:checked]:bg-accent-soft">
                <input type="radio" className="accent-[var(--accent)]" name="finish_tier" checked={tier === t.key} onChange={() => setTier(t.key)} />
                {t.label}
              </label>
            ))}
          </div>
          <p className="mt-2 text-sm text-muted">{SKIP_COPY}</p>
        </fieldset>
      </section>

      <section hidden={step !== 2} className="space-y-4">
        <label data-field="square_footage" className="block">
          <span className="ui-label">Square footage <span className="font-normal text-faint">(approximate is fine)</span></span>
          <input className="ui-input" type="number" min={1} required={step === 2} value={sqft} onChange={(e) => setSqft(e.target.value)} />
        </label>
        <div className="grid grid-cols-3 gap-3">
          <label data-field="existing_beds" className="block">
            <span className="ui-label">Beds now</span>
            <input className="ui-input" type="number" min={0} value={existing.beds} onChange={(e) => setExisting({ ...existing, beds: e.target.value })} />
          </label>
          <label data-field="existing_full_baths" className="block">
            <span className="ui-label">Full baths now</span>
            <input className="ui-input" type="number" min={0} value={existing.full_baths} onChange={(e) => setExisting({ ...existing, full_baths: e.target.value })} />
          </label>
          <label data-field="existing_half_baths" className="block">
            <span className="ui-label">Half baths now</span>
            <input className="ui-input" type="number" min={0} value={existing.half_baths} onChange={(e) => setExisting({ ...existing, half_baths: e.target.value })} />
          </label>
        </div>
        <div className="grid grid-cols-3 gap-3">
          <label data-field="target_beds" className="block">
            <span className="ui-label">Beds after</span>
            <input className="ui-input" type="number" min={0} value={target.beds} onChange={(e) => setTarget({ ...target, beds: e.target.value })} />
          </label>
          <label data-field="target_full_baths" className="block">
            <span className="ui-label">Full baths after</span>
            <input className="ui-input" type="number" min={0} value={target.full_baths} onChange={(e) => setTarget({ ...target, full_baths: e.target.value })} />
          </label>
          <label data-field="target_half_baths" className="block">
            <span className="ui-label">Half baths after</span>
            <input className="ui-input" type="number" min={0} value={target.half_baths} onChange={(e) => setTarget({ ...target, half_baths: e.target.value })} />
          </label>
        </div>
        <label data-field="year_built" className="block">
          <span className="ui-label">Year built <span className="font-normal text-faint">(skip if unsure)</span></span>
          <input className="ui-input" type="number" value={conditions.year_built} onChange={(e) => setConditions({ ...conditions, year_built: e.target.value })} />
        </label>
        <fieldset data-field="occupied" className="border-0 p-0">
          <legend className="ui-label">Living there during the work?</legend>
          <div className="grid grid-cols-2 gap-2">
            {["yes", "no"].map((v) => (
              <label key={v} className="flex cursor-pointer items-center gap-2.5 rounded-lg border border-line bg-surface px-3 py-2 text-sm transition-colors hover:border-faint has-[:checked]:border-accent has-[:checked]:bg-accent-soft">
                <input type="radio" className="accent-[var(--accent)]" name="occupied" checked={conditions.occupied === v} onChange={() => setConditions({ ...conditions, occupied: v })} />
                {v === "yes" ? "Yes" : "No"}
              </label>
            ))}
          </div>
        </fieldset>
        <fieldset data-field="access" className="border-0 p-0">
          <legend className="ui-label">How easy is access?</legend>
          <div className="grid gap-2 sm:grid-cols-3">
            {[
              { key: "easy", label: "Easy — driveway, clear paths" },
              { key: "moderate", label: "Moderate" },
              { key: "difficult", label: "Tight — city street, stairs" },
            ].map((a) => (
              <label key={a.key} className="flex cursor-pointer items-center gap-2.5 rounded-lg border border-line bg-surface px-3 py-2 text-sm transition-colors hover:border-faint has-[:checked]:border-accent has-[:checked]:bg-accent-soft">
                <input type="radio" className="accent-[var(--accent)]" name="access" checked={conditions.access === a.key} onChange={() => setConditions({ ...conditions, access: a.key })} />
                {a.label}
              </label>
            ))}
          </div>
        </fieldset>
        <fieldset data-field="known_problems" className="border-0 p-0">
          <legend className="ui-label">Known problems</legend>
          <div className="grid gap-2 sm:grid-cols-2">
            {KNOWN_PROBLEMS.map((p) => (
              <label key={p.key} className="flex cursor-pointer items-center gap-2.5 rounded-lg border border-line bg-surface px-3 py-2 text-sm transition-colors hover:border-faint has-[:checked]:border-accent has-[:checked]:bg-accent-soft">
                <input
                  type="checkbox"
                  className="accent-[var(--accent)]"
                  checked={problems.includes(p.key)}
                  onChange={(e) =>
                    setProblems(e.target.checked ? [...problems, p.key] : problems.filter((x) => x !== p.key))
                  }
                />
                {p.label}
              </label>
            ))}
          </div>
          <p className="mt-2 text-sm text-muted">{SKIP_COPY}</p>
        </fieldset>
      </section>

      <section hidden={step !== 3} className="space-y-4">
        <label data-field="narrative" className="block">
          <span className="ui-label">Describe what you&rsquo;re hoping to do <span className="font-normal text-faint">(optional)</span></span>
          <textarea className="ui-input" rows={6} maxLength={2000} value={narrative} onChange={(e) => setNarrative(e.target.value)} />
        </label>
        <PhotoUpload photos={photos} setPhotos={setPhotos} />
      </section>

      <div className="mt-7 flex items-center gap-3 border-t border-line pt-5">
        {step > 0 && (
          <button type="button" onClick={() => setStep(step - 1)} className="ui-btn ui-btn-ghost">
            Back
          </button>
        )}
        <button type="submit" disabled={submitting} className="ui-btn ui-btn-primary ml-auto">
          {step < 3 ? "Next" : submitting ? "Sending…" : "Send"}
        </button>
      </div>
    </form>
  );
}
