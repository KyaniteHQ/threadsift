import type { IntakeJobKind, OwnedJobKind } from "../../../core/contract/job-contract.ts";
import { X_INTAKE_TASK } from "../../../core/contract/x-intake-contract.ts";
import type { AiTaskRow } from "../../../core/kernel/ai-task-state.ts";
import type { BotTaskKind } from "../../ai/core/ai-kind-types.ts";
import type { BotAnswering } from "../../ai/core/bot-task-answering.ts";
import { digestKind } from "../../digest/core/digest-kind.ts";
import { relatedKind } from "../../related/core/related-kind.ts";
import { disagreementKind } from "../../wiki/core/disagreement-job.ts";
import { proposalsKind, topicProposalsKind } from "../../wiki/core/proposal-job.ts";
import { topicOverviewKind } from "../../wiki/core/topic-overview-kind.ts";
import { xIntakeKind } from "../../x/core/x-intake.ts";
import { isVerifyContext, verifyAnswering } from "./bot-verify-task.ts";

const BOT_TASK_KINDS = {
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
