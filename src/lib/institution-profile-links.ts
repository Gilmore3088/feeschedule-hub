export interface InstitutionProfileLinkParams {
  institutionId: number;
  institutionName: string;
}

export interface InstitutionProfileLinks {
  submitSourceHref: string;
  claimReviewHref: string;
  analyzeHref: string;
  briefHref: string;
  scenarioHref: string;
}

export function buildInstitutionProfileLinks({
  institutionId,
  institutionName,
}: InstitutionProfileLinkParams): InstitutionProfileLinks {
  const instId = String(institutionId);
  return {
    submitSourceHref: `/submit-fees?institutionId=${instId}&institutionName=${encodeURIComponent(institutionName)}`,
    claimReviewHref: `/login?from=${encodeURIComponent(`/pro/settings?instId=${instId}&claim=1`)}`,
    analyzeHref: `/pro/analyze?instId=${instId}&intent=institution`,
    briefHref: `/pro/reports?instId=${instId}&intent=competitive-brief`,
    scenarioHref: `/pro/simulate?instId=${instId}`,
  };
}
