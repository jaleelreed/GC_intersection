// Gap 2: pipeline stage + notes, org-scoped.
import { afterAll, describe, expect, it } from "vitest";
import { POST as INTAKE } from "../app/api/intake/[slug]/route";
import { listLeads, stageCounts, setStage, addNote, listNotes } from "../lib/leads/repo";
import { getPool } from "../lib/db";
import { validPayload } from "./intake.schema.test";
import { cleanupSubmissions } from "./helpers/cleanup";

const d = describe.skipIf(!process.env.DATABASE_URL);
const ORG = "00000000-0000-4000-8000-000000000001";
const USER = "00000000-0000-4000-8000-000000000002";

d("lead pipeline", () => {
  afterAll(async () => {
    // cleanupSubmissions removes lead_notes (FORCE RLS) with the org GUC set.
    await cleanupSubmissions(getPool(), "%@pipe-test.example");
    await getPool().end();
  });

  async function seed(email: string) {
    const res = await INTAKE(
      new Request("http://t/i", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ...validPayload(), contact_email: email }),
      }),
      { params: Promise.resolve({ slug: "fixture-link" }) }
    );
    return (await res.json()).id as string;
  }

  it("new leads default to 'new'; setStage moves them; counts reflect it", async () => {
    const id = await seed("p1@pipe-test.example");
    const before = await listLeads(ORG, { stage: "new" });
    expect(before.some((l) => l.id === id)).toBe(true);

    expect(await setStage(ORG, id, "won")).toBe(true);
    const won = await listLeads(ORG, { stage: "won" });
    expect(won.some((l) => l.id === id)).toBe(true);
    const counts = await stageCounts(ORG);
    expect(counts.won).toBeGreaterThanOrEqual(1);
  });

  it("setStage is org-scoped (wrong org can't move a lead)", async () => {
    const id = await seed("p2@pipe-test.example");
    expect(await setStage("00000000-0000-4000-8000-0000000000ff", id, "lost")).toBe(false);
  });

  it("notes append newest-first", async () => {
    const id = await seed("p3@pipe-test.example");
    await addNote(ORG, id, USER, "Called, left voicemail");
    await addNote(ORG, id, USER, "They want to start in spring");
    const notes = await listNotes(ORG, id);
    expect(notes.length).toBe(2);
    expect(notes[0].body).toContain("spring"); // newest first
  });
});
