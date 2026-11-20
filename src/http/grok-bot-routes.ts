import type { OpenAPIHono } from "@hono/zod-openapi";

import { readGrokBot, removeGrokBot, saveGrokBot } from "../core/ai/grok-bot-settings.ts";
import { pingGrokBot } from "../core/bot/grok-bot-ping.ts";
import { SETTINGS_CHANGED } from "../core/contract/ai-contract.ts";
import { GROK_BOT_IN_USE, KEY_NEEDED } from "../core/contract/grok-bot-contract.ts";
import type { Ports } from "../core/kernel/ports.ts";
import { readRoute, removeRoute, saveRoute, testRoute } from "./grok-bot-route-spec.ts";

export function registerGrokBotRoutes(app: OpenAPIHono, ports: Ports): void {
  app.openapi(readRoute, async (c) => c.json(await readGrokBot(ports), 200));
  app.openapi(saveRoute, async (c) => {
    const saved = await saveGrokBot(ports, c.req.valid("json"));

    switch (saved.kind) {
      case "saved":
        return c.json(saved.view, 200);
      case "secret-missing":
        return c.json({ kind: "refused", reason: "secret-missing" } as const, 200);
      case "changed":
        return c.json({ error: SETTINGS_CHANGED }, 409);
      case "key-needed":
        return c.json({ error: KEY_NEEDED }, 400);
      default: {
        const exhaustive: never = saved;

        return exhaustive;
      }
    }
  });
  app.openapi(removeRoute, async (c) => {
    const removed = await removeGrokBot(ports);

    return removed.kind === "removed"
      ? c.json(removed.view, 200)
      : c.json({ error: GROK_BOT_IN_USE, code: "in-use" } as const, 409);
  });
  app.openapi(testRoute, async (c) =>
    c.json({ result: await pingGrokBot(ports, c.req.raw.signal) }, 200),
  );
}
