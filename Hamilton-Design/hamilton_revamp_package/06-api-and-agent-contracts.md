# 06. API and Agent Contracts

## Principle
One API response shape per screen. Do not force every screen through one giant generic Hamilton response.

## Analyze response
```ts
interface AnalyzeResponse {
  title: string;
  confidence: {
    level: "high" | "medium" | "low";
    basis: string[];
  };
  hamiltonView: string;
  whatThisMeans: string;
  whyItMatters: string[];
  evidence: {
    metrics: Array<{ label: string; value: string; note?: string }>;
    chart?: unknown;
  };
  exploreFurther: string[];
}
```

## Simulate response
```ts
interface SimulationResponse {
  scenarioSetup: {
    feeCategory: string;
    currentFee: number;
    proposedFee: number;
    min?: number;
    max?: number;
  };
  currentState: {
    percentile: number;
    medianGap: number;
    riskProfile: string;
  };
  proposedState: {
    percentile: number;
    medianGap: number;
    riskProfile: string;
  };
  deltas: {
    percentileChange: number;
    medianGapChange: number;
    riskShift: string;
  };
  interpretation: string;
  tradeoffs: Array<{ label: string; value: string; note?: string }>;
  recommendedPosition: string;
}
```

## Report response
```ts
interface ReportSummaryResponse {
  title: string;
  executiveSummary: string[];
  snapshot: Array<{ label: string; current: string; proposed: string }>;
  strategicRationale: string;
  tradeoffs: Array<{ label: string; value: string }>;
  recommendation: string;
  implementationNotes: string[];
}
```

## Monitor response
```ts
interface MonitorResponse {
  status: {
    overall: "stable" | "watch" | "worsening";
    newSignals: number;
    highPriorityAlerts: number;
  };
  priorityAlert?: {
    title: string;
    severity: string;
    impact: string;
    whyItMatters: string;
    actions: string[];
  };
  signalFeed: Array<{
    tsLabel: string;
    signalType: string;
    title: string;
    implication: string;
    tags?: string[];
  }>;
  watchlists: {
    institutions: string[];
    feeCategories: string[];
    regions: string[];
  };
}
```

## Agent behavior by screen

### Analyze
- synthesize
- compare
- explain
- no final recommendation

### Simulate
- model one decision
- show deltas
- issue recommendation

### Report
- compress into executive-ready narrative
- no exploration

### Monitor
- summarize what changed
- prioritize what matters
