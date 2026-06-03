/**
 * Stage registry — the ordered list of stages the pipeline can run.
 *
 * Full-run execution order: discover (find fee URLs) → extract (URL → fees_raw)
 * → classify (raw → verified) → review (Knox accept/reject) → publish (verified
 * → published). snapshot lands later.
 */

import type { Stage } from "../stage";
import { discoverStage } from "./discover";
import { extractStage } from "./extract";
import { classifyStage } from "./classify";
import { reviewStage } from "./review";
import { publishStage } from "./publish";

export const STAGES: Stage[] = [
  discoverStage,
  extractStage,
  classifyStage,
  reviewStage,
  publishStage,
];

export function getStage(name: string): Stage | undefined {
  return STAGES.find((s) => s.name === name);
}

export function stageNames(): string[] {
  return STAGES.map((s) => s.name);
}
