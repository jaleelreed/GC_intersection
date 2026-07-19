-- ============================================================================
-- 060 INTAKE PHOTOS (GC_intersection)
-- Homeowners attach photos to a lead. Stored in Postgres as bytea (small,
-- client-compressed JPEGs; no external blob store). Org-scoped; served only
-- to the owning GC through a guarded route.
-- ============================================================================

CREATE TABLE intake_photos (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id        uuid NOT NULL REFERENCES organizations(id),
  intake_submission_id uuid NOT NULL REFERENCES intake_submissions(id),
  content_type  text NOT NULL,
  bytes         bytea NOT NULL,
  size_bytes    integer NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  deleted_at    timestamptz
);
CREATE INDEX idx_intake_photos_sub ON intake_photos (intake_submission_id) WHERE deleted_at IS NULL;
