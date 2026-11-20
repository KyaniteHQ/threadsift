import type { BotTaskKind } from "../ai/ai-kind-types.ts";
import type { BotAnswering } from "../ai/bot-task-answering.ts";
import type { IntakeJobKind, OwnedJobKind } from "../contract/job-contract.ts";
import { X_INTAKE_TASK } from "../contract/x-intake-contract.ts";
import { digestKind } from "../digest/digest-kind.ts";
import type { AiTaskRow } from "../kernel/ai-task-state.ts";
import { relatedKind } from "../related/related-kind.ts";
import { disagreementKind } from "../wiki/disagreement-job.ts";
import { proposalsKind, topicProposalsKind } from "../wiki/proposal-job.ts";
import { topicOverviewKind } from "../wiki/topic-overview-kind.ts";
import { xIntakeKind } from "../x/x-intake.ts";
import { isVerifyContext, verifyAnswering } from "./bot-verify-task.ts";

export const BOT_TASK_KINDS = {
  digest: digestKind,
  topic_overview: topicOverviewKind,
  related_pick: relatedKind,
  proposals: proposalsKind,
  topic_proposals: topicProposalsKind,
  disagreement_proposals: disagreementKind,
} as const satisfies Readonly<Record<Exclude<OwnedJobKind, IntakeJobKind>, BotTaskKind>>;

function isBotTaskKind(kind: string): kind is keyof typeof BOT_TASK_KINDS {
  return Object.hasOwn(BOT_TASK_KINDS, kind);
}

export function botKindOf({
  kind,
  context,
}: Readonly<Pick<AiTaskRow, "kind" | "context">>): BotAnswering | null {
  if (isVerifyContext(context)) return verifyAnswering;

  return isBotTaskKind(kind) ? BOT_TASK_KINDS[kind] : null;
}

export function describerOf(
  task: Readonly<Pick<AiTaskRow, "kind" | "context">>,
): Pick<BotAnswering, "describe"> | null {
  return task.kind === X_INTAKE_TASK ? xIntakeKind : botKindOf(task);
}
