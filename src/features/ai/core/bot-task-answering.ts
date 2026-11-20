import { z } from "zod";

import type { AiTaskDefinition } from "../../../core/contract/ai-contract.ts";
import { reasonsOf } from "../../../core/contract/zod-reasons.ts";
import { parsedJson } from "../../../core/kernel/parsed-json.ts";

export interface BotResult {
  readonly result: unknown;
}

export interface BotInstructions {
  readonly instructions: string;
  readonly schema: z.core.JSONSchema.BaseSchema;
}

type BotAnswer =
  | { readonly kind: "valid"; readonly normalized: string }
  | { readonly kind: "invalid"; readonly reasons: string };

export interface BotAnswering {
  readonly describe: (context: string) => BotInstructions | null;
  readonly parse: (context: string, body: Readonly<BotResult>) => BotAnswer;
}

interface AnsweringParts<Context, Result> {
  readonly context: z.ZodType<Context>;
  readonly task: (context: Context) => AiTaskDefinition<Result>;
}

export function answerOf<Context, Result>(
  { context, task }: Readonly<AnsweringParts<Context, Result>>,
  contextText: string,
  { result }: Readonly<BotResult>,
):
  | {
      readonly kind: "valid";
      readonly normalized: string;
      readonly context: Context;
      readonly result: Result;
    }
  | Extract<BotAnswer, { readonly kind: "invalid" }> {
  const parsedContext = parsedJson(context, contextText);

  if (parsedContext === null) return { kind: "invalid", reasons: "context: unreadable" };

  const parsed = task(parsedContext).schema.safeParse(result);

  if (!parsed.success) return { kind: "invalid", reasons: reasonsOf(parsed.error) };

  return {
    kind: "valid",
    normalized: JSON.stringify(parsed.data),
    context: parsedContext,
    result: parsed.data,
  };
}

export function botAnswering<Context, Result>(
  parts: Readonly<AnsweringParts<Context, Result>>,
): BotAnswering {
  const { context, task } = parts;

  return {
    describe: (contextText) => {
      const parsed = parsedJson(context, contextText);

      if (parsed === null) return null;

      const { instructions, schema } = task(parsed);

      return { instructions, schema: z.toJSONSchema(schema, { io: "output" }) };
    },
    parse: (contextText, body) => {
      const answer = answerOf(parts, contextText, body);

      return answer.kind === "valid" ? { kind: "valid", normalized: answer.normalized } : answer;
    },
  };
}
