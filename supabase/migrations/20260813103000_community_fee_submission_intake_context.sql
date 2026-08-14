ALTER TABLE public.community_fee_submissions
  ADD COLUMN IF NOT EXISTS submitter_role TEXT,
  ADD COLUMN IF NOT EXISTS notes TEXT,
  ADD COLUMN IF NOT EXISTS submission_kind TEXT NOT NULL DEFAULT 'fee_row';

COMMENT ON COLUMN public.community_fee_submissions.submitter_role IS
  'Self-reported role of the public source submitter, such as consumer, institution employee, or consultant.';
COMMENT ON COLUMN public.community_fee_submissions.notes IS
  'Optional reviewer context submitted with a public source or fee observation.';
COMMENT ON COLUMN public.community_fee_submissions.submission_kind IS
  'Distinguishes manual fee rows from source-only intake records.';
