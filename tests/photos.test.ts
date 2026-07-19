// Intake photos: submitting with photos stores them; org-scoped retrieval.
import { afterAll, describe, expect, it } from "vitest";
import { POST as INTAKE } from "../app/api/intake/[slug]/route";
import { listPhotoIds, getPhoto } from "../lib/intake/photos";
import { getPool } from "../lib/db";
import { validPayload } from "./intake.schema.test";
import { cleanupSubmissions } from "./helpers/cleanup";

const d = describe.skipIf(!process.env.DATABASE_URL);
const ORG = "00000000-0000-4000-8000-000000000001";

// A tiny valid JPEG-ish payload (bytes don't need to be a real image for storage).
const TINY = Buffer.from("hello-photo-bytes").toString("base64");

d("intake photos", () => {
  afterAll(async () => {
    await cleanupSubmissions(getPool(), "%@photo-test.example");
    await getPool().end();
  });

  it("stores submitted photos and serves them org-scoped", async () => {
    const res = await INTAKE(
      new Request("http://t/i", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          ...validPayload(),
          contact_email: "p@photo-test.example",
          photos: [
            { content_type: "image/jpeg", data_base64: TINY },
            { content_type: "image/jpeg", data_base64: TINY },
          ],
        }),
      }),
      { params: Promise.resolve({ slug: "fixture-link" }) }
    );
    expect(res.status).toBe(201);
    const { id } = await res.json();

    const ids = await listPhotoIds(ORG, id);
    expect(ids.length).toBe(2);

    const photo = await getPhoto(ORG, ids[0]);
    expect(photo?.contentType).toBe("image/jpeg");
    expect(photo?.bytes.toString()).toBe("hello-photo-bytes");

    // another org can't fetch it
    expect(await getPhoto("00000000-0000-4000-8000-0000000000ff", ids[0])).toBeNull();
  });

  it("a submission with no photos stores none", async () => {
    const res = await INTAKE(
      new Request("http://t/i", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ...validPayload(), contact_email: "np@photo-test.example" }),
      }),
      { params: Promise.resolve({ slug: "fixture-link" }) }
    );
    const { id } = await res.json();
    expect((await listPhotoIds(ORG, id)).length).toBe(0);
  });
});
