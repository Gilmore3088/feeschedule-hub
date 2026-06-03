/**
 * Stage registry — the ordered list of stages the pipeline can run.
 *
 * Execution order matters for a full run: classify (raw → verified) →
 * review (Knox accept/reject) → publish (verified → published). Phase 3 prepends
 * discover + extract; snapshot lands later.
 */

import type { Stage } from "../stage";
import { classifyStage } from "./classify";
import { reviewStage } from "./review";
import { publishStage } from "./publish";

export const STAGES: Stage[] = [classifyStage, reviewStage, publishStage];

export function getStage(name: string): Stage | undefined {
  return STAGES.find((s) => s.name === name);
}

export function stageNames(): string[] {
  return STAGES.map((s) => s.name);
}
