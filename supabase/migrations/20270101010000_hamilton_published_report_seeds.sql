SET lock_timeout = '10s';
SET statement_timeout = '120s';

BEGIN;

INSERT INTO public.hamilton_reports (
  id,
  user_id,
  institution_id,
  report_type,
  report_json,
  evidence_policy,
  peer_baseline_source,
  peer_baseline_label,
  selected_source,
  selected_source_label,
  selected_verified_fee_count,
  selected_provisional_fee_count,
  selected_fee_delta_count,
  status,
  created_at
)
VALUES
  (
    '00000000-0000-4000-8000-000000000001',
    0,
    'bfi-hamilton',
    'quarterly_strategy',
    $json$
    {
      "title": "Q1 2026 National Fee Landscape - Hamilton Intelligence",
      "executiveSummary": [
        "Median monthly maintenance fees held at $12.00 across the national Bank Fee Index coverage set. Banks priced above credit unions, keeping a visible consumer cost gap in everyday deposit accounts.",
        "Overdraft and NSF pricing stabilized near $30.00 nationally, while ATM non-network fees held near $3.00. The market is simplifying penalty-fee structures but not eliminating fee revenue."
      ],
      "snapshot": [],
      "strategicRationale": "The fee landscape reflects a split market: traditional banks are defending premium-priced services while credit unions and digital challengers undercut everyday fees. Monthly maintenance and overdraft remain the most visible consumer trust risks.",
      "tradeoffs": [
        { "label": "Monthly Maintenance", "value": "$12.00 national median" },
        { "label": "Overdraft Fee", "value": "$30.00 national median" },
        { "label": "NSF Fee", "value": "$30.00 national median" }
      ],
      "recommendation": "Institutions priced above the monthly maintenance median should run a retention and waiver-policy review before the next pricing cycle. Overdraft modernization should focus on alerts, grace periods, and documented waiver logic.",
      "implementationNotes": [
        "BFI-authored Hamilton publication",
        "Intended as a published library artifact for Pro users",
        "Verified benchmark scoring should continue to use approved rows only"
      ],
      "exportControls": { "pdfEnabled": true, "shareEnabled": false }
    }
    $json$::jsonb,
    'verified-only',
    'national',
    'National verified index',
    'manual',
    'BFI authored publication',
    0,
    0,
    0,
    'published',
    '2026-04-01T00:00:00Z'::timestamptz
  ),
  (
    '00000000-0000-4000-8000-000000000002',
    0,
    'bfi-hamilton',
    'monthly_pulse',
    $json$
    {
      "title": "Monthly Pulse: March 2026 - Fee Movement Intelligence",
      "executiveSummary": [
        "ATM non-network fees compressed around a $3.00 market anchor, reducing the spread between lower-cost and higher-cost institutions.",
        "Domestic outgoing wire fees remained broadly stable, but selective reductions signal competition for small business primary banking relationships."
      ],
      "snapshot": [],
      "strategicRationale": "Commodity fee categories are becoming less useful as differentiators. Institutions above market norms need stronger value proof, while targeted wire-fee reductions can support business banking acquisition.",
      "tradeoffs": [
        { "label": "ATM Non-Network Fee", "value": "$3.00 national median" },
        { "label": "Domestic Wire Outgoing", "value": "$28.00 national median" },
        { "label": "Foreign Transaction Fee", "value": "3.0% national median" }
      ],
      "recommendation": "Review ATM pricing above $3.50 against the institution's actual peer set. For small-business growth strategies, evaluate lower wire fees as a targeted acquisition lever rather than a broad consumer-fee cut.",
      "implementationNotes": [
        "BFI-authored Hamilton publication",
        "Movement claims require source-aware diligence before customer-specific use",
        "Verified benchmark scoring should continue to use approved rows only"
      ],
      "exportControls": { "pdfEnabled": true, "shareEnabled": false }
    }
    $json$::jsonb,
    'verified-only',
    'national',
    'National verified index',
    'manual',
    'BFI authored publication',
    0,
    0,
    0,
    'published',
    '2026-04-01T01:00:00Z'::timestamptz
  ),
  (
    '00000000-0000-4000-8000-000000000003',
    0,
    'bfi-hamilton',
    'state_index',
    $json$
    {
      "title": "Fed District Fee Comparison - Regional Intelligence Report",
      "executiveSummary": [
        "Fee levels vary by Federal Reserve district, making national medians useful context but incomplete decision support for local pricing.",
        "Dense credit union markets tend to pressure consumer-fee levels, while higher-cost metro markets can preserve pricing power but also attract sharper scrutiny."
      ],
      "snapshot": [],
      "strategicRationale": "Local competitive context changes the meaning of a fee. A $12.00 maintenance fee may be neutral nationally and exposed in a district or state where similar institutions cluster below that level.",
      "tradeoffs": [
        { "label": "District 2 Median", "value": "$13.50 monthly maintenance" },
        { "label": "District 10 Median", "value": "$9.50 monthly maintenance" },
        { "label": "District 6 Overdraft Range", "value": "$25.00 to $35.00" }
      ],
      "recommendation": "Use district and state peer sets before approving pricing changes. The consulting workflow should identify where national benchmarks hide local competitive risk.",
      "implementationNotes": [
        "BFI-authored Hamilton publication",
        "District classifications follow Federal Reserve district boundaries",
        "Verified benchmark scoring should continue to use approved rows only"
      ],
      "exportControls": { "pdfEnabled": true, "shareEnabled": false }
    }
    $json$::jsonb,
    'verified-only',
    'national',
    'National verified index',
    'manual',
    'BFI authored publication',
    0,
    0,
    0,
    'published',
    '2026-04-01T02:00:00Z'::timestamptz
  ),
  (
    '00000000-0000-4000-8000-000000000004',
    0,
    'bfi-hamilton',
    'peer_brief',
    $json$
    {
      "title": "Peer Benchmarking: Community Banks (Tier D/E) - Hamilton Intelligence",
      "executiveSummary": [
        "Community banks in the $100M to $1B asset range often carry higher operating costs and can price core consumer fees above national medians.",
        "Overdraft dependency remains a board-level risk where policy design, alerts, grace periods, and waiver controls are weaker than peer norms."
      ],
      "snapshot": [],
      "strategicRationale": "The community bank segment must defend fee revenue with visible customer value and strong policy controls. Fee elimination is not the only path, but opaque or punitive fee design increases retention and regulatory risk.",
      "tradeoffs": [
        { "label": "Monthly Maintenance", "value": "$13.50 Tier D/E average" },
        { "label": "Overdraft Fee", "value": "$32.00 Tier D/E average" },
        { "label": "ATM Non-Network", "value": "$3.00 average" }
      ],
      "recommendation": "Prioritize overdraft policy modernization over across-the-board fee elimination. Pair fee positioning with waiver logic, alerts, and a clear peer-backed rationale for board review.",
      "implementationNotes": [
        "BFI-authored Hamilton publication",
        "Tier D/E framing follows asset-tier peer benchmarking",
        "Verified benchmark scoring should continue to use approved rows only"
      ],
      "exportControls": { "pdfEnabled": true, "shareEnabled": false }
    }
    $json$::jsonb,
    'verified-only',
    'national',
    'National verified index',
    'manual',
    'BFI authored publication',
    0,
    0,
    0,
    'published',
    '2026-04-01T03:00:00Z'::timestamptz
  )
ON CONFLICT (id) DO UPDATE
SET
  user_id = EXCLUDED.user_id,
  institution_id = EXCLUDED.institution_id,
  report_type = EXCLUDED.report_type,
  report_json = EXCLUDED.report_json,
  evidence_policy = EXCLUDED.evidence_policy,
  peer_baseline_source = EXCLUDED.peer_baseline_source,
  peer_baseline_label = EXCLUDED.peer_baseline_label,
  selected_source = EXCLUDED.selected_source,
  selected_source_label = EXCLUDED.selected_source_label,
  selected_verified_fee_count = EXCLUDED.selected_verified_fee_count,
  selected_provisional_fee_count = EXCLUDED.selected_provisional_fee_count,
  selected_fee_delta_count = EXCLUDED.selected_fee_delta_count,
  status = EXCLUDED.status,
  created_at = EXCLUDED.created_at;

COMMIT;
