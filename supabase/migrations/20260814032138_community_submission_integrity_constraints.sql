SET lock_timeout = '10s';
SET statement_timeout = '120s';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'community_fee_submissions_review_status_check'
      AND conrelid = 'public.community_fee_submissions'::regclass
  ) THEN
    ALTER TABLE public.community_fee_submissions
      ADD CONSTRAINT community_fee_submissions_review_status_check
      CHECK (review_status IN ('pending', 'accepted', 'rejected', 'needs_info'));
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'community_fee_submissions_submission_kind_check'
      AND conrelid = 'public.community_fee_submissions'::regclass
  ) THEN
    ALTER TABLE public.community_fee_submissions
      ADD CONSTRAINT community_fee_submissions_submission_kind_check
      CHECK (submission_kind IN ('fee_row', 'source_intake'));
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'community_fee_submissions_submitter_role_check'
      AND conrelid = 'public.community_fee_submissions'::regclass
  ) THEN
    ALTER TABLE public.community_fee_submissions
      ADD CONSTRAINT community_fee_submissions_submitter_role_check
      CHECK (
        submitter_role IS NULL
        OR submitter_role IN ('consumer', 'institution_employee', 'consultant', 'other')
      );
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'community_fee_submissions_resolution_check'
      AND conrelid = 'public.community_fee_submissions'::regclass
  ) THEN
    ALTER TABLE public.community_fee_submissions
      ADD CONSTRAINT community_fee_submissions_resolution_check
      CHECK (
        resolution IS NULL
        OR resolution IN (
          'ready_for_validation_when_automation_resumes',
          'manual_validation_needed',
          'rejected_not_official',
          'needs_more_context'
        )
      );
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'community_fee_submissions_source_url_http_check'
      AND conrelid = 'public.community_fee_submissions'::regclass
  ) THEN
    ALTER TABLE public.community_fee_submissions
      ADD CONSTRAINT community_fee_submissions_source_url_http_check
      CHECK (btrim(source_url) ~* '^https?://');
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'community_fee_submissions_review_metadata_check'
      AND conrelid = 'public.community_fee_submissions'::regclass
  ) THEN
    ALTER TABLE public.community_fee_submissions
      ADD CONSTRAINT community_fee_submissions_review_metadata_check
      CHECK (
        (
          review_status = 'pending'
          AND reviewed_at IS NULL
          AND reviewer_id IS NULL
          AND resolution IS NULL
        )
        OR (
          review_status <> 'pending'
          AND reviewed_at IS NOT NULL
          AND reviewer_id IS NOT NULL
          AND resolution IS NOT NULL
        )
      );
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'community_fee_submission_events_status_check'
      AND conrelid = 'public.community_fee_submission_events'::regclass
  ) THEN
    ALTER TABLE public.community_fee_submission_events
      ADD CONSTRAINT community_fee_submission_events_status_check
      CHECK (
        (previous_status IS NULL OR previous_status IN ('pending', 'accepted', 'rejected', 'needs_info'))
        AND new_status IN ('pending', 'accepted', 'rejected', 'needs_info')
      );
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'community_fee_submission_events_metadata_object_check'
      AND conrelid = 'public.community_fee_submission_events'::regclass
  ) THEN
    ALTER TABLE public.community_fee_submission_events
      ADD CONSTRAINT community_fee_submission_events_metadata_object_check
      CHECK (jsonb_typeof(metadata) = 'object');
  END IF;
END $$;

COMMENT ON CONSTRAINT community_fee_submissions_review_metadata_check
  ON public.community_fee_submissions IS
  'Pending submissions must be unreviewed; reviewed submissions must carry reviewer, timestamp, and resolution metadata.';

COMMENT ON CONSTRAINT community_fee_submissions_source_url_http_check
  ON public.community_fee_submissions IS
  'Public source submissions must point to an HTTP(S) official source URL.';
