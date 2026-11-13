import { type OpenAPIHono, createRoute } from "@hono/zod-openapi";

import {
  GrokBotInputSchema,
  GrokBotSaveResponseSchema,
  GrokBotTestSchema,
  GrokBotViewSchema,
  KEY_NEEDED,
} from "../core/grok-bot-contract.ts";
import { pingGrokBot, readGrokBot, removeGrokBot, saveGrokBot } from "../core/grok-bot.ts";
import type { Ports } from "../core/ports.ts";
import { registerAiTaskRoutes } from "./ai-task-routes.ts";
import { jsonBody, jsonRequest } from "./openapi.ts";
import { ErrorResponseSchema } from "./schemas.ts";

const readRoute = createRoute({
  method: "get",
  path: "/api/settings/grok-bot",
  responses: {
    200: jsonBody(
      GrokBotViewSchema,
      "Whether a Grok Bot is set, its webhook address, and whether its key is saved (`usable`), saved but sealed under another key (`unreadable`), not set (`none`), or whether this Instance has no sealing key (`missing`). The key is never returned.",
    ),
  },
});

const saveRoute = createRoute({
  method: "put",
  path: "/api/settings/grok-bot",
  request: { body: jsonRequest(GrokBotInputSchema) },
  responses: {
    200: jsonBody(
      GrokBotSaveResponseSchema,
      "The settings after the save, with the address in its canonical form (an upper-case scheme or host comes back in lower case), or the refusal `secret-missing` when this Instance has no sealing key. Nothing is sent to the bot.",
    ),
    400: jsonBody(
      ErrorResponseSchema,
      "The address is not a public `https` address with no credentials, query or fragment (a bare `?` or `#` counts), the key is longer than 4,096 characters or holds a character other than printable ASCII (a space, a control character or any non-ASCII character), or no key came with a new address or a key this Instance cannot open. Nothing is saved.",
    ),
  },
});

const removeRoute = createRoute({
  method: "delete",
  path: "/api/settings/grok-bot",
  responses: {
    200: jsonBody(
      GrokBotViewSchema,
      "The settings after they are removed. Removing when none are set also succeeds.",
    ),
  },
});

const testRoute = createRoute({
  method: "post",
  path: "/api/settings/grok-bot/test",
  responses: {
    200: jsonBody(
      GrokBotTestSchema,
      "What the saved address and key got back from one ping: `ok` (HTTP 200), `wrong-key` (401 or 403), `not-found` (404), `bot-error` (any other status), `unreachable`, `timeout` (8 seconds), `refused` (the saved address fails the address rule, or on the container its name resolves only to non-global addresses), `not-configured` or `secret-missing`. The bot's own 401 is a result inside this 200, so it never signs the owner out. The ping wakes the bot's routine and costs it one run.",
    ),
  },
});

export function registerGrokBotRoutes(app: OpenAPIHono, ports: Ports): void {
  registerAiTaskRoutes(app, ports);
  app.openapi(readRoute, async (c) => c.json(await readGrokBot(ports), 200));
  app.openapi(saveRoute, async (c) => {
    const saved = await saveGrokBot(ports, c.req.valid("json"));

    switch (saved.kind) {
      case "saved":
        return c.json(saved.view, 200);
      case "secret-missing":
        return c.json({ kind: "refused", reason: "secret-missing" } as const, 200);
      case "key-needed":
        return c.json({ error: KEY_NEEDED }, 400);
      default: {
        const exhaustive: never = saved;

        return exhaustive;
      }
    }
  });
  app.openapi(removeRoute, async (c) => c.json(await removeGrokBot(ports), 200));
  app.openapi(testRoute, async (c) =>
    c.json({ result: await pingGrokBot(ports, c.req.raw.signal) }, 200),
  );
}
