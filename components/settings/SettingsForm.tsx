"use client";
// Gap 6: business name, service areas, markup defaults. Each control saves
// on its own; the page refreshes to reflect server truth.
import { useState } from "react";
import { useRouter } from "next/navigation";

interface County { fips: string; name: string; state_code: string; active: boolean }
interface Markup { id: string; name: string; rate_pct: string | null }

async function post(body: unknown): Promise<boolean> {
  const res = await fetch("/api/settings", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  return res.ok;
}

export function SettingsForm({
  orgName,
  counties,
  markups,
}: {
  orgName: string;
  counties: County[];
  markups: Markup[];
}) {
  const router = useRouter();
  const [name, setName] = useState(orgName);
  const [saved, setSaved] = useState<string | null>(null);
  const [rates, setRates] = useState<Record<string, string>>(
    Object.fromEntries(markups.map((m) => [m.id, m.rate_pct ?? ""]))
  );

  function flash(msg: string) {
    setSaved(msg);
    setTimeout(() => setSaved(null), 2000);
    router.refresh();
  }

  return (
    <div className="mt-6 space-y-6">
      {saved && <p className="font-semibold text-positive">{saved}</p>}

      <section className="ui-card p-6">
        <h2 className="font-display text-lg font-bold text-ink">Business name</h2>
        <p className="mt-1 text-sm text-muted">Shown on your intake form and every bid.</p>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <input className="ui-input flex-1" value={name} onChange={(e) => setName(e.target.value)} aria-label="Business name" />
          <button
            type="button"
            className="ui-btn ui-btn-primary"
            onClick={async () => {
              if (await post({ action: "business_name", name })) flash("Saved");
            }}
          >
            Save
          </button>
        </div>
      </section>

      <section className="ui-card p-6">
        <h2 className="font-display text-lg font-bold text-ink">Service area</h2>
        <p className="mt-1 text-sm text-muted">Counties you cover. Submissions outside are accepted but flagged.</p>
        <div className="mt-4 space-y-2">
          {counties.map((c) => (
            <label key={c.fips} className="flex items-center gap-2 text-ink">
              <input
                type="checkbox"
                defaultChecked={c.active}
                onChange={async (e) => {
                  await post({ action: "service_area", fips: c.fips, add: e.target.checked });
                  flash("Saved");
                }}
              />
              {c.name}, {c.state_code}
            </label>
          ))}
        </div>
      </section>

      <section className="ui-card p-6">
        <h2 className="font-display text-lg font-bold text-ink">Default markups</h2>
        <p className="mt-1 text-sm text-muted">Applied to every new draft, in order.</p>
        <div className="mt-4 space-y-3">
          {markups.map((m) => (
            <div key={m.id} className="flex flex-wrap items-center gap-2">
              <span className="min-w-0 flex-1 text-ink">{m.name}</span>
              <input
                className="ui-input w-24 text-right tabular-nums"
                inputMode="decimal"
                value={rates[m.id] ?? ""}
                onChange={(e) => setRates((r) => ({ ...r, [m.id]: e.target.value.replace(/[^0-9.]/g, "") }))}
                aria-label={`${m.name} percent`}
              />
              <span className="text-muted">%</span>
              <button
                type="button"
                className="ui-btn ui-btn-ghost"
                onClick={async () => {
                  if (await post({ action: "markup", id: m.id, rate_pct: rates[m.id] || "0" })) flash("Saved");
                }}
              >
                Save
              </button>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
