// US-005b: narrative → scope hints + risk flags, as SUGGESTIONS to the GC.
// D4 hard rule: nothing here is reachable from any pricing path — hints have
// no FK into estimates, and no pricing code imports this module.
import type { PoolClient } from "pg";
import { HINT_RULES, type HintKind } from "./hint-rules";

export interface ExtractedHint {
  kind: HintKind;
  text: string;
  source_excerpt: string;
  confidence: number;
}

/** Deterministic extraction: same narrative → same hints, ordered by rule. */
export function extractHints(narrative: string): ExtractedHint[] {
  const hints: ExtractedHint[] = [];
  for (const rule of HINT_RULES) {
    const m = narrative.match(rule.pattern);
    if (!m || m.index === undefined) continue;
    const start = Math.max(0, m.index - 30);
    const end = Math.min(narrative.length, m.index + m[0].length + 30);
    hints.push({
      kind: rule.kind,
      text: rule.text,
      source_excerpt: (start > 0 ? "…" : "") + narrative.slice(start, end).trim() + (end < narrative.length ? "…" : ""),
      confidence: 0.6, // keyword match: honest, mediocre, never higher
    });
  }
  return hints;
}

/**
 * Runs inside the conversion transaction: one ai_jobs row (complete,
 * verified_by pending) + one intake_scope_hints row per match.
 */
export async function extractAndStoreHints(
  db: PoolClient,
  args: { orgId: string; projectId: string | null; submissionId: string; narrative: string | null }
): Promise<number> {
  if (!args.narrative || args.narrative.trim() === "") return 0;

  const hints = extractHints(args.narrative);

  const job = (
    await db.query(
      `INSERT INTO ai_jobs (org_id, project_id, job_type, status, target_table, result, confidence, model)
       VALUES ($1, $2, 'summarize', 'complete', 'intake_scope_hints', $3, 0.6, 'keyword-rules-v1')
       RETURNING id`,
      [args.orgId, args.projectId, JSON.stringify({ hint_count: hints.length })]
    )
  ).rows[0];

  for (const h of hints) {
    await db.query(
      `INSERT INTO intake_scope_hints
         (org_id, intake_submission_id, kind, text, source_excerpt, ai_job_id, ai_confidence)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [args.orgId, args.submissionId, h.kind, h.text, h.source_excerpt, job.id, h.confidence]
    );
  }
  return hints.length;
}
