/**
 * Stage registry.
 *
 * The ordered list of stages the pipeline can run. Phase 1 registers only
 * `publish`. Later phases append discover, extract, classify, review, snapshot —
 * each a Stage against the same contract, in execution order.
 */

import type { Stage } from "../stage";
import { publishStage } from "./publish";

export const STAGES: Stage[] = [publishStage];

export function getStage(name: string): Stage | undefined {
  return STAGES.find((s) => s.name === name);
}

export function stageNames(): string[] {
  return STAGES.map((s) => s.name);
}
