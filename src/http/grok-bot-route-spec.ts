import { createRoute } from "@hono/zod-openapi";

import { SETTINGS_CHANGED } from "../core/contract/ai-contract.ts";
import { groupedNumber } from "../core/contract/format.ts";
import {
  GrokBotInUseSchema,
  GrokBotInputSchema,
  GrokBotSaveResponseSchema,
  GrokBotTestSchema,
  GrokBotViewSchema,
} from "../core/contract/grok-bot-contract.ts";
import { HOP_DEADLINE_MS } from "../core/contract/request-waits.ts";
import { SECRET_INPUT_MAX } from "../core/contract/secret-input.ts";
import { SECOND_MS } from "../core/contract/time-units.ts";
import { access } from "./access.ts";
import { jsonBody, jsonRequest } from "./openapi.ts";
import { ErrorResponseSchema } from "./schemas.ts";

export const readRoute = createRoute({
  method: "get",
  path: "/api/settings/grok-bot",
  middleware: access("owner"),
  responses: {
    200: jsonBody(
      GrokBotViewSchema,
      "Whether a Grok Bot is set, its webhook address, and whether its key is saved (`usable`), saved but sealed under another key (`unreadable`), not set (`none`), or whether this Instance has no sealing key (`missing`). The key is never returned.",
    ),
  },
});

export const saveRoute = createRoute({
  method: "put",
  path: "/api/settings/grok-bot",
  middleware: access("owner"),
  request: { body: jsonRequest(GrokBotInputSchema) },
  responses: {
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

export const removeRoute = createRoute({
  method: "delete",
  path: "/api/settings/grok-bot",
  middleware: access("owner"),
  responses: {
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

export const testRoute = createRoute({
  method: "post",
  path: "/api/settings/grok-bot/test",
  middleware: access("owner"),
  responses: {
    200: jsonBody(
      GrokBotTestSchema,
      `What the saved address and key got back from one ping: \`ok\` (HTTP 200), \`wrong-key\` (401 or 403), \`not-found\` (404), \`bot-error\` (any other status), \`unreachable\`, \`timeout\` (${String(HOP_DEADLINE_MS / SECOND_MS)} seconds), \`refused\` (the saved address fails the address rule, or on the container its name resolves only to non-global addresses), \`not-configured\` or \`secret-missing\`. The bot's own 401 is a result inside this 200, so it never signs the owner out. The ping wakes the bot's routine and costs it one run.`,
    ),
  },
});
