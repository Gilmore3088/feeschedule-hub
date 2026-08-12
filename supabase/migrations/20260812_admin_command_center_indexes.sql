BEGIN;

CREATE INDEX IF NOT EXISTS fees_verified_institution_active_idx
  ON fees_verified (institution_id)
  WHERE review_status != 'rejected';

COMMIT;
