import type { OpenAPIHono } from "@hono/zod-openapi";
import type { Context } from "hono";

import { readableTask } from "../core/bot/ai-task-read.ts";
import { type AnswerOutcome, acceptBotAnswer } from "../core/bot/bot-answer.ts";
import { refusedBodyOf } from "../core/contract/x-intake-contract.ts";
import type { Ports } from "../core/kernel/ports.ts";
import { acceptIntake } from "../core/x/x-intake-answer.ts";
import { intakeRoute } from "./ai-intake-spec.ts";
import { readRoute, resultRoute } from "./ai-task-route-spec.ts";
import { refusedBody } from "./intake-body.ts";
import { UNSUPPORTED_TASK } from "./task-credential.ts";

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
