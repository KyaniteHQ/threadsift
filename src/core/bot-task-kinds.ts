import type { BotTaskKind, IntakeKind } from "./ai-kind-types.ts";
import type { AiTaskRow } from "./ai-task-state.ts";
import { isVerifyContext, verifyAnswering } from "./bot-verify.ts";
import { digestKind } from "./digest-kind.ts";
import { disagreementKind } from "./disagreement-job.ts";
import type { IntakeJobKind, OwnedJobKind } from "./kinds.ts";
import { proposalsKind, topicProposalsKind } from "./proposal-job.ts";
import { relatedKind } from "./related-kind.ts";
import { topicOverviewKind } from "./topic-overview-kind.ts";
import { X_INTAKE_TASK } from "./x-intake-contract.ts";
import { xIntakeKind } from "./x-intake.ts";

export const BOT_TASK_KINDS = {
  digest: digestKind,
  topic_overview: topicOverviewKind,
  related_pick: relatedKind,
  proposals: proposalsKind,
  topic_proposals: topicProposalsKind,
  disagreement_proposals: disagreementKind,
} as const satisfies Readonly<Record<Exclude<OwnedJobKind, IntakeJobKind>, BotTaskKind>>;

export const AI_TASK_KINDS = {
  ...BOT_TASK_KINDS,
  [X_INTAKE_TASK]: xIntakeKind,
} as const satisfies Readonly<
  Record<Exclude<OwnedJobKind, IntakeJobKind> | typeof X_INTAKE_TASK, BotTaskKind | IntakeKind>
>;

function isAiTaskKind(kind: string): kind is keyof typeof AI_TASK_KINDS {
  return Object.hasOwn(AI_TASK_KINDS, kind);
}

export function botKindOf({ kind, context }: Readonly<Pick<AiTaskRow, "kind" | "context">>) {
  if (isVerifyContext(context)) return verifyAnswering;

  return isAiTaskKind(kind) ? AI_TASK_KINDS[kind] : null;
}
