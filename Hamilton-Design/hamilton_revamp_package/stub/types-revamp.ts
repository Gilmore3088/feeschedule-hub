export interface AnalyzeResponse {
  title: string;
  hamiltonView: string;
  whatThisMeans: string;
  whyItMatters: string[];
  exploreFurther: string[];
}

export interface SimulationResponse {
  currentFee: number;
  proposedFee: number;
  currentPercentile: number;
  proposedPercentile: number;
  interpretation: string;
  recommendedPosition: string;
}

export interface MonitorResponse {
  overallStatus: "stable" | "watch" | "worsening";
  newSignals: number;
  highPriorityAlerts: number;
}
