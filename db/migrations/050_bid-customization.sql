-- ============================================================================
-- 050 BID CUSTOMIZATION (GC_intersection)
-- A real bid carries more than line items: a cover note, what's included and
-- excluded, terms, and an expiration the buyer can see. proposals already has
-- expires_at; add the narrative fields. Additive.
-- ============================================================================

ALTER TABLE proposals
  ADD COLUMN cover_note text,
  ADD COLUMN inclusions text,
  ADD COLUMN exclusions text,
  ADD COLUMN terms text;
