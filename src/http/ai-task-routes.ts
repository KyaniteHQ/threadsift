import { type OpenAPIHono, createRoute, z } from "@hono/zod-openapi";

import { BotAnswerSchema, acceptBotAnswer } from "../core/bot-answer.ts";
import type { Ports } from "../core/ports.ts";
import { jsonBody, jsonRequest, noContent } from "./openapi.ts";
import { ErrorResponseSchema } from "./schemas.ts";
import { CREDENTIAL_ONLY, CREDENTIAL_REQUIRED, taskCredential } from "./task-credential.ts";

const UNSUPPORTED_TASK = "unsupported-task";

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
    401: jsonBody(
      ErrorResponseSchema,
      `${CREDENTIAL_REQUIRED}: the header is missing or malformed, the task does not exist, or the credential belongs to another task or to an earlier send of this task. The answer is the same for all of them.`,
    ),
    403: jsonBody(
      ErrorResponseSchema,
      `${CREDENTIAL_ONLY}: the call carries the owner's session or an agent token and no matching task credential.`,
    ),
    409: jsonBody(
      ErrorResponseSchema,
      "The task is not running, is past its deadline, or already holds an answer. Nothing changes. A repeated call lands here, so the bot treats 409 as done.",
    ),
  },
});

export function registerAiTaskRoutes(app: OpenAPIHono, ports: Ports): void {
  app.use("/api/ai-tasks/:id/result", taskCredential(ports));
  app.openapi(resultRoute, async (c) => {
    const body = c.req.valid("json");

    const outcome = await acceptBotAnswer(
      ports,
      c.get("callbackTask"),
      "error" in body
        ? { kind: "error", text: body.error }
        : { kind: "result", resultText: JSON.stringify(body.result) },
    );

    switch (outcome.kind) {
      case "accepted":
        return c.body(null, 204);
      case "unsupported":
        return c.json({ error: UNSUPPORTED_TASK }, 400);
      case "invalid":
        return c.json({ error: outcome.reasons }, 400);
      case "closed":
        return c.json({ error: "The task no longer takes an answer" }, 409);
      default: {
        const exhaustive: never = outcome;

        return exhaustive;
      }
    }
  });
}
