import { z } from "zod";

import { AI_REASON_MAX, type AiTaskDefinition } from "../../../core/contract/ai-contract.ts";
import { plainText } from "../../../core/contract/plain-text.ts";
import { type MergeKind, WEEKLY_TASK } from "../../../core/contract/proposal-contract.ts";
import { MERGE } from "./merge-kinds.ts";
import { MERGE_PAIRS_PER_RUN, pairKey } from "./proposal-candidates.ts";
import type { SentPair } from "./proposal-sent.ts";

export interface ProposalsResult {
  readonly merges: readonly Readonly<{ from: number; into: number; reason: string }>[];
}

const MergeSchema = z
  .object({
    from: z.number().int().positive(),
    into: z.number().int().positive(),
    reason: plainText(AI_REASON_MAX),
  })
  .readonly();

function mergesAreSentPairs(
  merges: ProposalsResult["merges"],
  sent: readonly Readonly<SentPair>[],
): boolean {
  const allowed = new Set(sent.map(({ low, high }) => pairKey(low.id, high.id)));
  const named = merges.flatMap(({ from, into }) => [from, into]);

  return (
    new Set(named).size === named.length &&
    merges.every(({ from, into }) => from !== into && allowed.has(pairKey(from, into)))
  );
}

export function proposalsTask(
  kind: MergeKind,
  sent: readonly Readonly<SentPair>[],
): AiTaskDefinition<ProposalsResult> {
  return {
    kind: WEEKLY_TASK[kind],
    instructions: MERGE[kind].instructions,
    prepareInput: (input) => input,
    schema: z
      .object({ merges: z.array(MergeSchema).max(MERGE_PAIRS_PER_RUN).readonly() })
      .refine(({ merges }) => mergesAreSentPairs(merges, sent), {
        error:
          "merges: each merge must name both ids of one pair that was sent, and no id may repeat",
      }),
  };
}
