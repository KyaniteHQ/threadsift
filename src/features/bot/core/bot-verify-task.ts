import { z } from "zod";

import { VERIFY_INPUT } from "../../../core/contract/ai-contract.ts";
import { VERIFY_DEADLINE_MS } from "../../../core/contract/grok-bot-contract.ts";
import { parsedJson } from "../../../core/kernel/parsed-json.ts";
import { botAnswering } from "../../ai/core/bot-task-answering.ts";
import type { BotTaskStart } from "../../ai/core/bot-task-start.ts";
import { DIGEST_TASK } from "../../digest/core/digest-task.ts";

const VerifyContextSchema = z.strictObject({ verify: z.literal(true) }).readonly();

const VERIFY_CONTEXT = JSON.stringify({ verify: true });

export const verifyAnswering = botAnswering({
  context: VerifyContextSchema,
  task: () => DIGEST_TASK,
});

export function isVerifyContext(context: string | null): boolean {
  return parsedJson(VerifyContextSchema, context ?? "") !== null;
}

export const VERIFY_START: BotTaskStart = {
  kind: DIGEST_TASK.kind,
  inputs: DIGEST_TASK.prepareInput(VERIFY_INPUT),
  inputRevision: 1,
  context: VERIFY_CONTEXT,
  deadlineMs: VERIFY_DEADLINE_MS,
};
