import { createRoute, z, type OpenAPIHono } from "@hono/zod-openapi";
import type { Context } from "hono";

import { ErrorResponseSchema } from "../../../core/contract/error-wire.ts";
import { byteSize } from "../../../core/contract/format.ts";
import { ERROR_TEXT_MAX } from "../../../core/contract/grok-bot-contract.ts";
import { MAX_ROW_BYTES } from "../../../core/contract/limits.ts";
import { IntakeAnswerSchema, refusedBodyOf } from "../../../core/contract/x-intake-contract.ts";
import type { Ports } from "../../../core/kernel/ports.ts";
import { access, RESULT_CAP, tooLarge, ITEM_CAP } from "../../../http/access.ts";
import { jsonBody, jsonRequest, noContent } from "../../../http/openapi.ts";
import { CREDENTIAL_REFUSALS, UNSUPPORTED_TASK } from "../../../http/task-credential.ts";
import { TaskReadSchema, readableTask } from "../../bot/core/ai-task-read.ts";
import { BotAnswerSchema, acceptBotAnswer, type AnswerOutcome } from "../../bot/core/bot-answer.ts";
import { acceptIntake } from "../../x/core/x-intake-answer.ts";
import { countedRefusals, refusedBody } from "./intake-body.ts";

const readRoute = createRoute({
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

const resultRoute = createRoute({
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

const intakeRoute = createRoute({
  method: "post",
  path: "/api/ai-tasks/{id}/intake",
  middleware: [access("callback", { body: ITEM_CAP }), countedRefusals] as const,
  request: {
    params: z.object({ id: z.string() }),
    body: jsonRequest(IntakeAnswerSchema),
  },
  responses: {
    204: noContent(
      `With \`content\`, the X thread is stored for the task's Item without being shown, the Digest (when the body holds one) is kept for the Item's Digest job, the task is done and the Item's fetch job is closed. A verification job then checks every post of the thread against X's own embed answer and shows only what X confirms; a thread whose post X does not confirm, or that X cannot confirm after the job's retries, ends the Item with the fetch result \`unreadable\`, which keeps the saved copy of an Item that had one and leaves a new Item without content. The thread is limited to ${byteSize(MAX_ROW_BYTES)} of JSON, as for any other row. With \`unavailable\`, the task is done, the fetch job is closed and the Item stays a Link-only Item. A second call lands on 409.`,
    ),
    400: jsonBody(
      ErrorResponseSchema,
      `The task is not an X link task (\`${UNSUPPORTED_TASK}\`); the body is neither \`{ "content": <text>, "digest"?: <Digest> }\` nor \`{ "unavailable": true }\`; or \`content\` is not an X thread JSON text of the task's post, with the reasons in \`error\`. The task stays open, so the bot can answer again. The second refusal of one send moves the task's deadline to now, so the same deadline transition runs: the task fails as a timeout and the next send follows at the job's retry delay.`,
    ),
    ...CREDENTIAL_REFUSALS,
    409: jsonBody(
      ErrorResponseSchema,
      "The task is not running, is past its deadline, or already holds an answer, or the Item's content changed or its fetch job closed since the task was sent. Nothing is published. In the last case the task fails and its fetch job is due again. A repeated call lands here, so the bot treats 409 as done.",
    ),
    413: jsonBody(ErrorResponseSchema, `${tooLarge(ITEM_CAP)}. Nothing changes.`),
  },
});

const CLOSED = "The task no longer takes an answer";

function answered(c: Context, outcome: AnswerOutcome) {
  switch (outcome.kind) {
    case "accepted":
      return c.body(null, 204);
    case "unsupported":
      return c.json({ error: UNSUPPORTED_TASK }, 400);
    case "invalid":
      return c.json({ error: outcome.reasons }, 400);
    case "closed":
      return c.json({ error: CLOSED }, 409);
    default: {
      const exhaustive: never = outcome;

      return exhaustive;
    }
  }
}

export function registerAiTaskRoutes(app: OpenAPIHono, ports: Ports): void {
  app.openapi(readRoute, async (c) => {
    const reading = await readableTask(ports.db, c.get("callbackTask"));

    switch (reading.kind) {
      case "open":
        return c.json(reading.task, 200);
      case "unsupported":
        return c.json({ error: UNSUPPORTED_TASK }, 400);
      case "closed":
        return c.json({ error: CLOSED }, 409);
      default: {
        const exhaustive: never = reading;

        return exhaustive;
      }
    }
  });
  app.openapi(
    intakeRoute,
    async (c) => {
      const outcome = await acceptIntake(ports, c.get("callbackTask"), c.req.valid("json"));

      if (outcome.kind === "invalid") c.set("intakeRefusal", outcome.logged);

      return answered(c, outcome);
    },
    (result, c) => (result.success ? undefined : refusedBody(c, refusedBodyOf(result.error))),
  );
  app.openapi(resultRoute, async (c) => {
    const body = c.req.valid("json");

    return answered(
      c,
      await acceptBotAnswer(
        ports,
        c.get("callbackTask"),
        "error" in body ? { kind: "error", text: body.error } : { kind: "result", body },
      ),
    );
  });
}
