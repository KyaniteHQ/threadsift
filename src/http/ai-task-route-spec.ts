import { createRoute, z } from "@hono/zod-openapi";

import { TaskReadSchema } from "../core/bot/ai-task-read.ts";
import { BotAnswerSchema } from "../core/bot/bot-answer.ts";
import { ErrorResponseSchema } from "../core/contract/error-wire.ts";
import { ERROR_TEXT_MAX } from "../core/contract/grok-bot-contract.ts";
import { access, RESULT_CAP, tooLarge } from "./access.ts";
import { jsonBody, jsonRequest, noContent } from "./openapi.ts";
import { CREDENTIAL_REFUSALS, UNSUPPORTED_TASK } from "./task-credential.ts";

export const readRoute = createRoute({
  method: "get",
  path: "/api/ai-tasks/{id}",
  middleware: access("callback", { body: RESULT_CAP, cache: "no-store" }),
  request: { params: z.object({ id: z.string() }) },
  responses: {
    200: jsonBody(
      TaskReadSchema,
      "What the bot is asked to do: the task's `kind`, its `instructions`, its `input` as the text Threadsift stored and the JSON Schema its answer has to fit. Reading changes nothing, so the bot can read again. Every answer of this route carries `Cache-Control: no-store`.",
    ),
    400: jsonBody(
      ErrorResponseSchema,
      `The task's kind has nothing to read (\`${UNSUPPORTED_TASK}\`).`,
    ),
    ...CREDENTIAL_REFUSALS,
    409: jsonBody(
      ErrorResponseSchema,
      "The task is not running, is past its deadline, or already holds an answer. Nothing is returned.",
    ),
  },
});

export const resultRoute = createRoute({
  method: "post",
  path: "/api/ai-tasks/{id}/result",
  middleware: access("callback", { body: RESULT_CAP }),
  request: {
    params: z.object({ id: z.string() }),
    body: jsonRequest(BotAnswerSchema),
  },
  responses: {
    204: noContent(
      "The answer is stored on the task and the job that owns the task is due now. The task's credential still matches but no second answer is accepted.",
    ),
    400: jsonBody(
      ErrorResponseSchema,
      `The body is neither \`{ "result": <JSON> }\` nor \`{ "error": <1 to ${String(ERROR_TEXT_MAX)} characters> }\`; the task's kind does not use this route (\`${UNSUPPORTED_TASK}\`); or the result does not fit the task's schema, with the reasons in \`error\`. The task stays open, so the bot can answer again.`,
    ),
    ...CREDENTIAL_REFUSALS,
    409: jsonBody(
      ErrorResponseSchema,
      "The task is not running, is past its deadline, or already holds an answer. Nothing changes. A repeated call lands here, so the bot treats 409 as done.",
    ),
    413: jsonBody(ErrorResponseSchema, `${tooLarge(RESULT_CAP)}. Nothing changes.`),
  },
});
