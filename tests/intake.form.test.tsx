// US-005 skin parity: both presentations render THE SAME field components —
// one component set, two skins (D5). Static render, no browser needed.
import { describe, expect, it } from "vitest";
import { renderToString } from "react-dom/server";
import { IntakeForm } from "../components/intake/IntakeForm";

const link = { slug: "fixture-link", display_name: "Fixture Renovations LLC" };

function fieldIds(html: string): string[] {
  return [...html.matchAll(/data-field="([^"]+)"/g)].map((m) => m[1]).sort();
}

describe("intake form skins", () => {
  it("embed and link skins expose identical field sets", () => {
    const linkHtml = renderToString(<IntakeForm slug={link.slug} variant="link" />);
    const embedHtml = renderToString(<IntakeForm slug={link.slug} variant="embed" />);
    const ids = fieldIds(linkHtml);
    expect(ids.length).toBeGreaterThan(15);
    expect(fieldIds(embedHtml)).toEqual(ids);
  });

  it("renders all ten scope toggles", () => {
    const html = renderToString(<IntakeForm slug={link.slug} variant="link" />);
    for (const key of ["bath", "kitchen", "floors", "walls", "utilities", "plumbing", "electric", "mechanical", "roof", "basement"]) {
      expect(html).toContain(`data-toggle="${key}"`);
    }
  });

  it("includes the honeypot field, visually hidden", () => {
    const html = renderToString(<IntakeForm slug={link.slug} variant="link" />);
    expect(html).toContain('name="website"');
    expect(html).toContain("hp-wrap");
  });
});
