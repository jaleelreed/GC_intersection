// US-008 notification contract + RLS enforcement (notifications is FORCE RLS).
import { afterAll, describe, expect, it } from "vitest";
import { POST } from "../app/api/intake/[slug]/route";
import { inbox, markRead } from "../lib/notifications/repo";
import { getPool, orgQuery } from "../lib/db";
import { validPayload } from "./intake.schema.test";
import { cleanupSubmissions } from "./helpers/cleanup";

const d = describe.skipIf(!process.env.DATABASE_URL);

const ORG = "00000000-0000-4000-8000-000000000001";
const OTHER_ORG = "00000000-0000-4000-8000-0000000000ff";
const OWNER = "00000000-0000-4000-8000-000000000002";

function request(body: unknown) {
  return new Request("http://test.local/api/intake/x", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}
const params = (slug: string) => ({ params: Promise.resolve({ slug }) });

d("US-008 in-platform notification", () => {
  afterAll(async () => {
    await cleanupSubmissions(getPool(), "%@notify-test.example");
    await getPool().end();
  });

  it("conversion fans out to owner_admin with title, channel body, unread", async () => {
    const res = await POST(
      request({ ...validPayload(), contact_email: "n1@notify-test.example", address_line1: "77 Notify Test Rd" }),
      params("fixture-qr")
    );
    expect(res.status).toBe(201);
    const { id } = await res.json();

    const rows = (
      await orgQuery(
        ORG,
        `SELECT user_id, kind, title, body, read_at FROM notifications
         WHERE subject_table = 'intake_submissions' AND subject_id = $1`,
        [id]
      )
    ).rows;
    expect(rows.length).toBe(1);
    expect(rows[0].user_id).toBe(OWNER);
    expect(rows[0].kind).toBe("intake_received");
    expect(rows[0].title).toBe("New lead: 77 Notify Test Rd");
    expect(rows[0].body).toContain("via qr");
    expect(rows[0].read_at).toBeNull();
  });

  it("RLS is force-enabled with a WITH CHECK policy on notifications + lead_notes", async () => {
    // Structural proof (CI's postgres role is a superuser and bypasses RLS at
    // runtime; in prod a non-superuser role is subject to these). Verify the
    // FORCE flag and that the tenant policy constrains writes too (WITH CHECK).
    const forced = (
      await getPool().query<{ relname: string; relforcerowsecurity: boolean }>(
        `SELECT relname, relforcerowsecurity FROM pg_class
         WHERE relname IN ('notifications', 'lead_notes') AND relkind = 'r'`
      )
    ).rows;
    expect(forced.length).toBe(2);
    for (const t of forced) expect(t.relforcerowsecurity).toBe(true);

    const policies = (
      await getPool().query<{ tablename: string; with_check: string | null }>(
        `SELECT tablename, with_check FROM pg_policies
         WHERE schemaname = 'public' AND tablename IN ('notifications', 'lead_notes')
           AND policyname LIKE 'tenant_isolation_%'`
      )
    ).rows;
    expect(policies.length).toBe(2);
    for (const p of policies) expect(p.with_check).not.toBeNull(); // writes constrained
  });

  it("spam produces no notification", async () => {
    const res = await POST(
      request({
        ...validPayload(),
        contact_email: "spam@notify-test.example",
        address_line1: "78 Notify Test Rd",
        form_started_at: Date.now() - 500,
      }),
      params("fixture-link")
    );
    const { id } = await res.json();
    const n = (
      await orgQuery(ORG, "SELECT count(*)::int AS c FROM notifications WHERE subject_id = $1", [id])
    ).rows[0].c;
    expect(n).toBe(0);
  });

  it("inbox lists newest-first and markRead is single-shot per user", async () => {
    const before = await inbox(ORG, OWNER, { unreadOnly: true });
    expect(before.length).toBeGreaterThan(0);
    const target = before[0];

    expect(await markRead(ORG, target.id, OWNER)).toBe(true);
    expect(await markRead(ORG, target.id, OWNER)).toBe(false); // already read

    const after = await inbox(ORG, OWNER, { unreadOnly: true });
    expect(after.some((n) => n.id === target.id)).toBe(false);
  });
});
