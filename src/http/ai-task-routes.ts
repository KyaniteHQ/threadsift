import { type OpenAPIHono, createRoute, z } from "@hono/zod-openapi";
import type { Context } from "hono";

import { TaskReadSchema, readableTask } from "../core/ai-task-read.ts";
import { BotAnswerSchema, acceptBotAnswer } from "../core/bot-answer.ts";
import type { Ports } from "../core/ports.ts";
import { acceptIntake, refusedIntake } from "../core/x-intake-answer.ts";
import { IntakeAnswerSchema, refusedBodyOf } from "../core/x-intake-contract.ts";
import { jsonBody, jsonRequest, noContent } from "./openapi.ts";
import { ErrorResponseSchema } from "./schemas.ts";
import { CREDENTIAL_ONLY, CREDENTIAL_REQUIRED, taskCredential } from "./task-credential.ts";

const UNSUPPORTED_TASK = "unsupported-task";

const CREDENTIAL_REFUSALS = {
  401: jsonBody(
    ErrorResponseSchema,
    `${CREDENTIAL_REQUIRED}: the header is missing or malformed, the task does not exist, or the credential belongs to another task or to an earlier send of this task. The answer is the same for all of them.`,
  ),
  403: jsonBody(
    ErrorResponseSchema,
    `${CREDENTIAL_ONLY}: the call carries the owner's session or an agent token and no matching task credential.`,
  ),
};

const readRoute = createRoute({
  method: "get",
  path: "/api/ai-tasks/{id}",
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
      `The body is neither \`{ "result": <JSON> }\` nor \`{ "error": <1 to 200 characters> }\`; the task's kind does not use this route (\`${UNSUPPORTED_TASK}\`); or the result does not fit the task's schema, with the reasons in \`error\`. The task stays open, so the bot can answer again.`,
    ),
    ...CREDENTIAL_REFUSALS,
    409: jsonBody(
      ErrorResponseSchema,
      "The task is not running, is past its deadline, or already holds an answer. Nothing changes. A repeated call lands here, so the bot treats 409 as done.",
    ),
    413: jsonBody(ErrorResponseSchema, "The request body is larger than 256 KiB. Nothing changes."),
  },
});

const intakeRoute = createRoute({
  method: "post",
  path: "/api/ai-tasks/{id}/intake",
  request: {
    params: z.object({ id: z.string() }),
    body: jsonRequest(IntakeAnswerSchema),
  },
  responses: {
    204: noContent(
      "With `content`, the X thread is stored for the task's Item without being shown, the Digest (when the body holds one) is kept for the Item's Digest job, the task is done and the Item's fetch job is closed. A verification job then checks every post of the thread against X's own embed answer and shows only what X confirms; a thread whose post X does not confirm, or that X cannot confirm after the job's retries, ends the Item with the fetch result `unreadable`, which keeps the saved copy of an Item that had one and leaves a new Item without content. The thread is limited to 1,499,998 bytes of JSON, as for any other row. With `unavailable`, the task is done, the fetch job is closed and the Item stays a Link-only Item. A second call lands on 409.",
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
    413: jsonBody(ErrorResponseSchema, "The request body is larger than 8 MiB. Nothing changes."),
  },
});

const CLOSED = "The task no longer takes an answer";

type AnswerOutcome =
  | { readonly kind: "accepted" }
  | { readonly kind: "unsupported" }
  | { readonly kind: "closed" }
  | { readonly kind: "invalid"; readonly reasons: string };

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

function registerRead(app: OpenAPIHono, ports: Ports): void {
  app.on("GET", "/api/ai-tasks/:id", async (c, next) => {
    await next();
    c.header("Cache-Control", "no-store");
  });
  app.on("GET", "/api/ai-tasks/:id", taskCredential(ports));
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
}

export function registerAiTaskRoutes(app: OpenAPIHono, ports: Ports): void {
  registerRead(app, ports);
  app.use("/api/ai-tasks/:id/result", taskCredential(ports));
  app.use("/api/ai-tasks/:id/intake", taskCredential(ports));
  app.use("/api/ai-tasks/:id/intake", async (c, next) => {
    await next();

    if (c.res.status === 400) {
      await refusedIntake(
        ports,
        c.get("callbackTask"),
        c.get("intakeRefusal") ?? "unreadable-body",
      );
    }
  });
  app.openapi(
    intakeRoute,
    async (c) => {
      const outcome = await acceptIntake(ports, c.get("callbackTask"), c.req.valid("json"));

      if (outcome.kind === "invalid") c.set("intakeRefusal", outcome.logged);

      return answered(c, outcome);
    },
    (result, c) => {
      const refusal = result.success ? null : refusedBodyOf(result.error);

      if (refusal !== null) c.set("intakeRefusal", refusal.logged);

      return refusal === null ? undefined : c.json({ error: refusal.error }, 400);
    },
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
