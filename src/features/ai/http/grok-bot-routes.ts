import { createRoute, type OpenAPIHono } from "@hono/zod-openapi";

import { SETTINGS_CHANGED } from "../../../core/contract/ai-contract.ts";
import { ErrorResponseSchema } from "../../../core/contract/error-wire.ts";
import { groupedNumber } from "../../../core/contract/format.ts";
import {
  GrokBotInUseSchema,
  GrokBotInputSchema,
  GrokBotSaveResponseSchema,
  GrokBotTestSchema,
  GrokBotViewSchema,
  GROK_BOT_IN_USE,
  KEY_NEEDED,
} from "../../../core/contract/grok-bot-contract.ts";
import { HOP_DEADLINE_MS } from "../../../core/contract/request-waits.ts";
import { SECRET_INPUT_MAX } from "../../../core/contract/secret-input.ts";
import { SECOND_MS } from "../../../core/contract/time-units.ts";
import type { Ports } from "../../../core/kernel/ports.ts";
import { access } from "../../../http/access.ts";
import { jsonBody, jsonRequest, accessNote, accessRefusals } from "../../../http/openapi.ts";
import { pingGrokBot } from "../../bot/core/grok-bot-ping.ts";
import { readGrokBot, removeGrokBot, saveGrokBot } from "../core/grok-bot-settings.ts";

const OWNER = access("owner");

const readRoute = createRoute({
  method: "get",
  path: "/api/settings/grok-bot",
  middleware: OWNER,
  description: accessNote(OWNER),
  responses: {
    ...accessRefusals(OWNER),
    200: jsonBody(
      GrokBotViewSchema,
      "Whether a Grok Bot is set, its webhook address, and whether its key is saved (`usable`), saved but sealed under another key (`unreadable`), not set (`none`), or whether this Instance has no sealing key (`missing`). The key is never returned.",
    ),
  },
});

const saveRoute = createRoute({
  method: "put",
  path: "/api/settings/grok-bot",
  middleware: OWNER,
  description: accessNote(OWNER),
  request: { body: jsonRequest(GrokBotInputSchema) },
  responses: {
    ...accessRefusals(OWNER),
    200: jsonBody(
      GrokBotSaveResponseSchema,
      "The settings after the save, with the address in its canonical form (an upper-case scheme or host comes back in lower case), or the refusal `secret-missing` when this Instance has no sealing key. Nothing is sent to the bot.",
    ),
    400: jsonBody(
      ErrorResponseSchema,
      `The address is not a public \`https\` address with no credentials, query or fragment (a bare \`?\` or \`#\` counts), the key is longer than ${groupedNumber(SECRET_INPUT_MAX)} characters or holds a character other than printable ASCII (a space, a control character or any non-ASCII character), or no key came with a new address or a key this Instance cannot open. Nothing is saved.`,
    ),
    409: jsonBody(
      ErrorResponseSchema,
      `The settings changed while this save was prepared (\`error: ${SETTINGS_CHANGED}\`). Nothing from this save was written; send it again.`,
    ),
  },
});

const removeRoute = createRoute({
  method: "delete",
  path: "/api/settings/grok-bot",
  middleware: OWNER,
  description: accessNote(OWNER),
  responses: {
    ...accessRefusals(OWNER),
    200: jsonBody(
      GrokBotViewSchema,
      "The settings after they are removed. Removing when none are set also succeeds.",
    ),
    409: jsonBody(
      GrokBotInUseSchema,
      "Grok Bot is the Provider (`code: in-use`). Nothing is removed until another Provider is saved.",
    ),
  },
});

const testRoute = createRoute({
  method: "post",
  path: "/api/settings/grok-bot/test",
  middleware: OWNER,
  description: accessNote(OWNER),
  responses: {
    ...accessRefusals(OWNER),
    200: jsonBody(
      GrokBotTestSchema,
      `What the saved address and key got back from one ping: \`ok\` (HTTP 200), \`wrong-key\` (401 or 403), \`not-found\` (404), \`bot-error\` (any other status), \`unreachable\`, \`timeout\` (${String(HOP_DEADLINE_MS / SECOND_MS)} seconds), \`refused\` (the saved address fails the address rule, or on the container its name resolves only to non-global addresses), \`not-configured\` or \`secret-missing\`. The bot's own 401 is a result inside this 200, so it never signs the owner out. The ping wakes the bot's routine and costs it one run.`,
    ),
  },
});

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
