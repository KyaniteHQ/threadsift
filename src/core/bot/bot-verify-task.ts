import { z } from "zod";

import { botAnswering } from "../ai/bot-task-answering.ts";
import type { BotTaskStart } from "../ai/bot-task-start.ts";
import { VERIFY_INPUT } from "../contract/ai-contract.ts";
import { VERIFY_DEADLINE_MS } from "../contract/grok-bot-contract.ts";
import { DIGEST_TASK } from "../digest/digest-task.ts";
import { parsedJson } from "../kernel/parsed-json.ts";

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
