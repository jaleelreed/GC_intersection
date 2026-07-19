// Gap 4: link creation + channel analytics, org-scoped.
import { afterAll, describe, expect, it } from "vitest";
import { createLink, listLinks, setLinkActive, channelStats } from "../lib/links/repo";
import { getPool } from "../lib/db";

const d = describe.skipIf(!process.env.DATABASE_URL);
const ORG = "00000000-0000-4000-8000-000000000001";

d("intake links", () => {
  const created: string[] = [];
  afterAll(async () => {
    if (created.length) await getPool().query(`DELETE FROM intake_links WHERE id = ANY($1)`, [created]);
    await getPool().end();
  });

  it("creates a link with a unique slug and lists it with a lead count", async () => {
    const a = await createLink(ORG, "Spring signs", "qr", "Fixture Renovations LLC");
    created.push(a.id);
    expect(a.slug).toMatch(/^gc-[0-9a-f]{12}$/);
    const links = await listLinks(ORG);
    const mine = links.find((l) => l.id === a.id);
    expect(mine).toBeDefined();
    expect(mine!.channel).toBe("qr");
    expect(mine!.lead_count).toBe(0);
  });

  it("can deactivate a link (org-scoped)", async () => {
    const a = await createLink(ORG, "Temp", "link", "Fixture Renovations LLC");
    created.push(a.id);
    expect(await setLinkActive(ORG, a.id, false)).toBe(true);
    expect(await setLinkActive("00000000-0000-4000-8000-0000000000ff", a.id, true)).toBe(false);
  });

  it("channelStats returns all three channels", async () => {
    const stats = await channelStats(ORG);
    expect(stats.map((s) => s.channel).sort()).toEqual(["embed", "link", "qr"]);
    for (const s of stats) expect(s.leads).toBeGreaterThanOrEqual(0);
  });
});
