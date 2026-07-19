// Intake photo storage + retrieval. Bytea in Postgres; org-scoped access.
import { getPool } from "../db";

export async function storePhotos(
  orgId: string,
  submissionId: string,
  photos: { content_type: string; data_base64: string }[]
): Promise<void> {
  for (const p of photos.slice(0, 6)) {
    const buf = Buffer.from(p.data_base64, "base64");
    if (buf.length === 0 || buf.length > 600_000) continue; // skip empty / oversized
    await getPool().query(
      `INSERT INTO intake_photos (org_id, intake_submission_id, content_type, bytes, size_bytes)
       VALUES ($1, $2, $3, $4, $5)`,
      [orgId, submissionId, p.content_type, buf, buf.length]
    );
  }
}

export async function listPhotoIds(orgId: string, submissionId: string): Promise<string[]> {
  const r = await getPool().query(
    `SELECT id FROM intake_photos
     WHERE org_id = $1 AND intake_submission_id = $2 AND deleted_at IS NULL
     ORDER BY created_at`,
    [orgId, submissionId]
  );
  return r.rows.map((x) => x.id);
}

export async function getPhoto(
  orgId: string,
  photoId: string
): Promise<{ contentType: string; bytes: Buffer } | null> {
  const r = await getPool().query(
    `SELECT content_type, bytes FROM intake_photos
     WHERE id = $1 AND org_id = $2 AND deleted_at IS NULL`,
    [photoId, orgId]
  );
  if (!r.rows[0]) return null;
  return { contentType: r.rows[0].content_type, bytes: r.rows[0].bytes };
}
