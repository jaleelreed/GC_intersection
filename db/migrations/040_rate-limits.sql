-- ============================================================================
-- 040 RATE LIMITS (GC_intersection)
-- Serverless (Vercel) has no shared in-memory state and there is no Redis, so
-- the limiter is a DB-backed fixed-window counter on Neon. Global table (no
-- org_id, no RLS): keyed by route+client, bucketed by time window.
-- ============================================================================

CREATE TABLE rate_limits (
  bucket_key text PRIMARY KEY,     -- '<route>:<client>:<window_epoch>'
  count      integer NOT NULL DEFAULT 0,
  expires_at timestamptz NOT NULL
);
CREATE INDEX idx_rate_limits_expiry ON rate_limits (expires_at);
