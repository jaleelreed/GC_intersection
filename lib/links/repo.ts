// Gap 4: intake-link management + channel analytics. A GC holds many doors
// (website embed, truck QR, per-campaign links); each carries channel
// attribution so they learn which door produces leads (D5).
import { randomBytes } from "node:crypto";
import { getPool, orgQuery } from "../db";

export type Channel = "embed" | "link" | "qr";
export const CHANNELS: Channel[] = ["link", "qr", "embed"];

export interface LinkRow {
  id: string;
  slug: string;
  channel: Channel;
  label: string | null;
  is_active: boolean;
  lead_count: number;
}

export async function listLinks(orgId: string): Promise<LinkRow[]> {
  const r = await orgQuery<LinkRow>(
    orgId,
    `SELECT il.id, il.slug, il.channel, il.label, il.is_active,
            count(s.id) FILTER (WHERE s.status = 'converted')::int AS lead_count
     FROM intake_links il
     LEFT JOIN intake_submissions s ON s.intake_link_id = il.id AND s.deleted_at IS NULL
     WHERE il.org_id = $1 AND il.deleted_at IS NULL
     GROUP BY il.id
     ORDER BY il.created_at`,
    [orgId]
  );
  return r.rows;
}

export async function createLink(
  orgId: string,
  label: string,
  channel: Channel,
  displayName: string
): Promise<{ id: string; slug: string }> {
  const slug = `gc-${randomBytes(6).toString("hex")}`;
  const r = await getPool().query(
    `INSERT INTO intake_links (org_id, slug, channel, label, display_name, is_active)
     VALUES ($1, $2, $3, $4, $5, true) RETURNING id, slug`,
    [orgId, slug, channel, label, displayName]
  );
  return r.rows[0];
}

export async function setLinkActive(orgId: string, id: string, active: boolean): Promise<boolean> {
  const r = await getPool().query(
    `UPDATE intake_links SET is_active = $3 WHERE id = $2 AND org_id = $1 AND deleted_at IS NULL`,
    [orgId, id, active]
  );
  return (r.rowCount ?? 0) > 0;
}

export interface ChannelStat {
  channel: Channel;
  leads: number;
  won: number;
}

export async function channelStats(orgId: string): Promise<ChannelStat[]> {
  const r = await orgQuery(
    orgId,
    `SELECT channel,
            count(*) FILTER (WHERE status = 'converted')::int AS leads,
            count(*) FILTER (WHERE status = 'converted' AND pipeline_stage = 'won')::int AS won
     FROM intake_submissions
     WHERE org_id = $1 AND deleted_at IS NULL
     GROUP BY channel`,
    [orgId]
  );
  const base: Record<Channel, ChannelStat> = {
    link: { channel: "link", leads: 0, won: 0 },
    qr: { channel: "qr", leads: 0, won: 0 },
    embed: { channel: "embed", leads: 0, won: 0 },
  };
  for (const row of r.rows) base[row.channel as Channel] = { channel: row.channel, leads: row.leads, won: row.won };
  return CHANNELS.map((c) => base[c]);
}
