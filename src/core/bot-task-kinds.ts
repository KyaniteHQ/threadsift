import type { BotTaskKind } from "./bot-task-kind.ts";
import { digestBotKind } from "./digest-bot.ts";
import { disagreementRun } from "./disagreement-job.ts";
import type { JobKind } from "./kinds.ts";
import { runOf } from "./proposal-job.ts";
import { relatedBotKind } from "./related-bot.ts";
import { topicOverviewBotKind } from "./topic-overview-bot.ts";
import { weeklyBotKind } from "./weekly-bot.ts";

export const BOT_TASK_KINDS = {
  digest: digestBotKind,
  topic_overview: topicOverviewBotKind,
  related_pick: relatedBotKind,
  proposals: weeklyBotKind(runOf("tag-merge")),
  topic_proposals: weeklyBotKind(runOf("topic-merge")),
  disagreement_proposals: weeklyBotKind(disagreementRun),
} as const satisfies Readonly<Record<Exclude<JobKind, "fetch">, BotTaskKind>>;
