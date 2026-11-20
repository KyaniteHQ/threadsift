import { AI_DEADLINE_MS } from "../../../core/contract/ai-contract.ts";
import { defineJob } from "../../../core/kernel/job-spec.ts";
import { relatedKind } from "./related-kind.ts";

export const relatedPickHandler = defineJob("related_pick", {
  deadlineMs: AI_DEADLINE_MS,
  blockedBy: ["digest"],
  attempt: relatedKind.attempt,
});
