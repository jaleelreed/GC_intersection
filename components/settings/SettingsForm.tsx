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
    <div>
      {saved && <p className="gci-saved">{saved}</p>}

      <section className="gci-share">
        <h2>Business name</h2>
        <p className="gci-hint">Shown on your intake form and every bid.</p>
        <div className="gci-copyrow">
          <input value={name} onChange={(e) => setName(e.target.value)} aria-label="Business name" />
          <button
            type="button"
            className="gci-primary"
            onClick={async () => {
              if (await post({ action: "business_name", name })) flash("Saved");
            }}
          >
            Save
          </button>
        </div>
      </section>

      <section className="gci-share">
        <h2>Service area</h2>
        <p className="gci-hint">Counties you cover. Submissions outside are accepted but flagged.</p>
        {counties.map((c) => (
          <label key={c.fips} className="gci-check">
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
      </section>

      <section className="gci-share">
        <h2>Default markups</h2>
        <p className="gci-hint">Applied to every new draft, in order.</p>
        {markups.map((m) => (
          <div key={m.id} className="gci-markup-row">
            <span>{m.name}</span>
            <input
              inputMode="decimal"
              value={rates[m.id] ?? ""}
              onChange={(e) => setRates((r) => ({ ...r, [m.id]: e.target.value.replace(/[^0-9.]/g, "") }))}
              aria-label={`${m.name} percent`}
            />
            <span>%</span>
            <button
              type="button"
              className="gci-btn"
              onClick={async () => {
                if (await post({ action: "markup", id: m.id, rate_pct: rates[m.id] || "0" })) flash("Saved");
              }}
            >
              Save
            </button>
          </div>
        ))}
      </section>
    </div>
  );
}
