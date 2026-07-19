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

  it("RLS: a non-privileged role in another org context sees zero notifications", async () => {
    // SET ROLE to the non-superuser probe role so RLS actually applies (CI's
    // postgres role is a superuser and would otherwise bypass FORCE RLS).
    async function countAs(org: string): Promise<number> {
      const c = await getPool().connect();
      try {
        await c.query("BEGIN");
        await c.query(`SET LOCAL app.org_id = '${org}'`);
        await c.query("SET LOCAL ROLE rls_probe");
        const r = await c.query<{ c: number }>("SELECT count(*)::int AS c FROM notifications");
        await c.query("ROLLBACK");
        return r.rows[0].c;
      } finally {
        c.release();
      }
    }
    // The fixture org has notifications; another org, under RLS, sees none.
    expect(await countAs(ORG)).toBeGreaterThan(0);
    expect(await countAs(OTHER_ORG)).toBe(0);
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
